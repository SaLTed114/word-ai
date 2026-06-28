# Word AI Assistant: A Controllable Large-Language-Model Writing Assistant for Microsoft Word

Author: Please fill in name and student ID  
Affiliation: Please fill in school / major / course information  
Course: BME1320  
Date: June 27, 2026

## Abstract

Large language models can already perform grammar correction, academic polishing, translation, summarization, and conversational writing assistance. However, directly connecting a general-purpose model to a real document editor such as Microsoft Word remains challenging. A usable writing assistant must understand the current document context, return structured and reviewable edit operations, preserve user control, support multi-turn writing goals, and decompose compound requests into focused subtasks. This paper presents Word AI Assistant, an AI writing assistant system for Word/WPS-style document editing. The system consists of a FastAPI backend, a SQLite session store, a unified `TaskResponse` schema, a document context builder, runtime-editable skill files, a subagent dispatch mechanism, and a Word Web Add-in frontend. Instead of simply sending selected text to a model and pasting the output back, Word AI Assistant wraps model outputs as previewable, confirmable, and undoable edit actions. Agent sessions and explicit memory fields support long-running writing tasks, while subagents provide modular handling of proofreading, academic polishing, summarization, translation, and formula conversion. Following an AAAI-style system paper structure, this report describes the motivation, software architecture, core functionality, runtime logic, evaluation protocol, and limitations of the project. Automated tests show that the current implementation reliably supports subagent execution, context construction, session persistence, structured actions, and multi-turn mock scenarios. The project demonstrates that a reliable LLM writing assistant depends not only on model capability, but also on the control, interface, and interaction layers surrounding the model.

## 1. Introduction

Academic writing is a central task in biomedical engineering education and research training. When students write project reports, lab reports, methods sections, or result analyses, they must not only avoid grammatical errors, but also preserve technical meaning, use accurate terminology, maintain an academic tone, and sometimes handle formulas, symbols, and bilingual expressions. Traditional grammar checkers are usually effective for local spelling and grammar issues, but they do not understand the surrounding document structure. General chatbots can provide richer suggestions, but their responses are often detached from the user's current Word selection, paragraph, or document.

A practical Word AI writing assistant must address several requirements. First, it needs document context. The same sentence may require different revisions depending on whether it appears in an abstract, a methods section, a discussion section, or a conclusion. Second, document modification must be safe and controllable. The model should not silently overwrite user content; instead, it should return reviewable edit proposals containing the original text, replacement text, reason, risk level, and confirmation requirement. Third, real writing support is often multi-turn. A user may first ask for an explanation, then request a more concise version, and finally emphasize that the scientific meaning should not be changed. Fourth, user requests are often compound. For example, "check the grammar and make it more formal" contains both proofreading and academic-polishing objectives. A single mixed prompt can easily over-edit the text or miss local issues.

This project builds Word AI Assistant to study these problems. The goal is not to train a new language model, but to package a general-purpose LLM into a controllable, extensible, Word-integrated writing assistant. The project starts from a simple baseline: given a text input and a fixed prompt, call the model and return a result. It then incrementally introduces document context construction, structured responses, session memory, subagent dispatch, skill management, and Word Add-in integration.

The main contributions are:

- We design and implement an LLM writing-assistant architecture for Word document editing, covering backend APIs, model invocation, session storage, frontend integration, and packaged startup.
- We define a unified `TaskResponse` and `TextAction` schema that transforms natural-language model outputs into previewable, confirmable, and undoable document edit operations.
- We implement a document context builder that normalizes Word selections, full-document text, paragraph scopes, before/after context windows, and user instructions into model-ready requests.
- We introduce agent sessions and explicit session memory for document summaries, writing goals, key terms, and user preferences.
- We design and validate a subagent framework supporting explicit subagents, model-planned subagents, stepwise run/merge, and LLM-based merge.
- We implement a Word Web Add-in frontend that can read Word selections, send document context, render actions, apply rewrites, insert formulas, and support undo/review.

## 2. Related Work and Background

### 2.1 LLM-Based Writing Assistance

LLM-based writing assistants typically operate through natural-language input and output. They can correct grammar, rewrite text, translate content, summarize documents, and answer questions. This conversational interaction is sufficient for many chat scenarios. In a document editor, however, the assistant must do more than answer "how should this be improved?" It must also tell the client where to apply the change, what the replacement is, how risky the change is, and whether user confirmation is required. Therefore, this project focuses on system-level LLM packaging rather than on a single prompt or model output.

### 2.2 Document-Centered Human-AI Interaction

Document editors such as Microsoft Word differ from ordinary chat windows. A document has structure: headings, paragraphs, selections, equations, comments, and surrounding context. The user interaction pattern is also different: select text, request help, preview suggestions, apply or undo edits, and continue asking follow-up questions. A writing assistant should therefore integrate model outputs into the document-editing workflow rather than forcing the user to manually copy and paste text from a chat response.

### 2.3 Agent and Tool-Oriented Design

Agent-oriented systems emphasize multi-turn context, task decomposition, and tool use. The agent in this project is intentionally lightweight. It reads the current selection, conversation history, and memory; classifies the user intent as query or edit; and returns structured actions. The subagent mechanism further decomposes compound writing requests into focused subtasks, such as proofreading, academic polishing, summarization, translation, and formula handling. This reduces the responsibility overload of a single monolithic prompt.

## 3. Problem Formulation

We formulate Word AI Assistant as a structured document writing-assistance task. Given:

- a user message `message`;
- the current selected text or document scope `selection`;
- document context `document_context`, including full text, title, section heading, selection offsets, and context windows;
- conversation history `history`;
- explicit session memory `memory`;
- optional skills and subagent configuration;

the system outputs a `TaskResponse`:

```json
{
  "task": "syntax | word_choice | style | formula | agent",
  "reply": "user-facing explanation or answer",
  "summary": "one-sentence summary or null",
  "actions": [],
  "final_text": "complete revised text or null",
  "subagent_calls": []
}
```

The `actions` field is the key to document integration. Each action describes one proposed operation:

- `type`: for example `replace_selection`, `replace_range`, `add_comment`, `insert_equation`, or `ask_user`;
- `target`: the scope, such as selection, range, paragraph, section, document, or cursor;
- `original` and `replacement`: the text before and after the proposed edit;
- `preview`: before/after text for UI inspection;
- `reason`: why the edit is suggested;
- `risk_level`: info, low, medium, or high;
- `requires_confirmation`: whether the user must confirm before applying the edit.

This formulation converts a writing assistant from a pure question-answering system into a document-editing system. The model no longer only generates text; it generates reviewable edit proposals.

## 4. System Overview

Word AI Assistant uses a separated frontend-backend architecture with unified backend orchestration. The overall framework is shown in Figure 1.

```text
Figure 1. Overall architecture.

Microsoft Word
  -> Word Web Add-in
       -> Ribbon commands: Syntax / Words / Rewrite / Formula / Agent / Settings
       -> Task pane: chat, action preview, apply, undo, review
       -> Settings pane: model config, memory, UI behavior, subagents

Local unified server
  -> HTTPS static server for add-in pages
  -> FastAPI backend
       -> API layer: app.main
       -> Service layer: app.services
       -> Prompt layer: app.prompts + prompts/*.md
       -> Model gateway: app.ai_client
       -> Context builder: app.context_builder
       -> Session storage: app.storage + SQLite
       -> Subagent registry: app.subagents + skills/*.md
       -> Data schema: app.models
```

The system has three major entry points:

1. **Word Add-in**: the real user interface. It reads the current Word selection or document body, sends requests to the backend, and applies returned actions to the document.
2. **HTTP CLI**: a debugging interface that simulates frontend requests and validates API, context builder, agent session, and skill behavior.
3. **Simple Web Demo**: a lightweight browser-based text editor that demonstrates the agent data flow without opening Word.

The key design decision is that all clients share the same backend API, prompt templates, response schema, and session storage. This avoids duplicated business logic across Word, CLI, and web clients.

## 5. Software Framework

### 5.1 Unified Server Entry Point

`server.py` is the unified entry point for the packaged application. It starts two services in one process:

- a FastAPI backend, by default on `127.0.0.1:8000`;
- an HTTPS static file server for the Word Add-in, by default on `https://localhost:3443`.

The startup procedure is:

1. Read command-line arguments `--api-port` and `--ui-port`, or environment variables `WORD_AI_API_PORT` and `WORD_AI_UI_PORT`.
2. Check whether the requested ports are already in use. If necessary, find the next available port.
3. Resolve the resource directory depending on whether the application is running from source or as a PyInstaller frozen bundle.
4. Locate `localhost.pem` and `localhost-key.pem` under `.certs` or `certs`.
5. Start the HTTPS static server for `taskpane.html`, `settings.html`, `commands.html`, and icon assets.
6. Serve `/runtime-config.json`, which tells the frontend the active backend API URL.
7. Start `uvicorn app.main:app`.

This entry point satisfies the HTTPS requirement of Word Add-ins while keeping the user-facing startup process simple.

### 5.2 Configuration Layer

`app/config.py` manages model settings and writable data paths. It supports:

| Key | Purpose |
|---|---|
| `OPENAI_API_KEY` | model API key |
| `OPENAI_MODEL` | model name |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL |
| `OPENAI_API_ENDPOINT` | direct endpoint for the ShanghaiTech GenAI gateway |
| `OPENAI_PROXY_URL` | optional proxy |
| `OPENAI_TRUST_ENV` | whether to trust system proxy environment variables |
| `OPENAI_USE_JSON_MODE` | whether to request JSON-mode output |

When running from source, the data directory defaults to the project root. In a packaged environment, the system first attempts to read the writable data directory from the Windows registry, then falls back to `%APPDATA%\Word AI Assistant`. This prevents the installed application directory from being used for mutable user data.

### 5.3 API Layer

`app/main.py` defines the FastAPI application. During lifespan startup, it reads `AISettings`, initializes `AIClient` when the configuration is ready, and initializes `AgentSessionStore`. The API layer receives HTTP requests, validates Pydantic models, calls the service layer, and maps exceptions to HTTP responses.

```text
Table 1. Major HTTP endpoints.
```

| Endpoint | Method | Function |
|---|---:|---|
| `/health` | GET | Check service and AI configuration status |
| `/settings/ai-config` | GET/PUT | Read or update model settings |
| `/tasks/syntax` | POST | Grammar, spelling, punctuation, and clarity checking |
| `/tasks/word-choice` | POST | Word choice and phrasing improvement |
| `/tasks/style` | POST | Rewrite text in a target style |
| `/tasks/formula` | POST | LaTeX, equation, and Word equation handling |
| `/context/build` | POST | Convert document context to `TextRequest` |
| `/agent/sessions` | POST/GET | Create or list agent sessions |
| `/agent/sessions/{id}` | GET/DELETE | Read or delete a session |
| `/agent/sessions/{id}/messages` | GET/POST | Read history or send one agent turn |
| `/agent/sessions/{id}/memory` | GET/PUT | Read or update session memory |
| `/agent/sessions/{id}/subagents/plan` | POST | Plan subagent calls |
| `/agent/sessions/{id}/subagents/run` | POST | Run one subagent independently |
| `/agent/sessions/{id}/subagents/merge` | POST | Merge subagent outputs |
| `/skills` | GET/POST | List or create skill files |
| `/skills/{name}` | GET/PUT/DELETE | Read, update, or delete a skill |

### 5.4 Service Layer

`app/services.py` contains the core business logic. It converts HTTP-level requests into prompts and calls `AIClient` to obtain structured outputs. Important functions include:

- `run_syntax`: build the syntax prompt and return grammar-checking results;
- `run_word_choice`: build the word-choice prompt and return phrasing suggestions;
- `run_style`: build the style prompt and return a rewritten version;
- `run_formula`: build the formula prompt and label the response as a formula task;
- `run_agent_turn`: build a multi-turn agent prompt with history, memory, skills, and current selection;
- `plan_subagents`: ask a planner model to decide which subagents are useful;
- `run_subagent_turn`: execute a focused subagent with skill instructions and allowed action types;
- `merge_subagent_results`: merge replies, actions, summaries, and final text by rule;
- `merge_subagent_results_with_llm`: reconcile subagent conflicts through an additional LLM call.

The service layer keeps the API layer thin and makes the same logic reusable from Word, CLI, and web clients.

### 5.5 Model Gateway

`app/ai_client.py` encapsulates model calls. It supports:

1. an OpenAI-compatible SDK mode using `AsyncOpenAI`;
2. a direct endpoint mode using `httpx.AsyncClient`, intended for the school GenAI gateway.

The model-call flow is:

1. Construct system and user messages.
2. Use a low temperature to reduce randomness.
3. Request JSON object output when `use_json_mode=true`.
4. Fall back to normal completion if JSON mode is not supported.
5. Extract the returned content.
6. Remove possible Markdown code fences.
7. Parse the content with `json.loads`.
8. Validate the result with a Pydantic model, such as `TaskResponse` or `AgentPlan`.

If the model returns empty content, invalid JSON, or data that does not match the schema, the backend raises `AIClientError`. The API layer turns this into a 502 response instead of sending an unsafe partial result to the frontend.

### 5.6 Data Model Layer

`app/models.py` defines shared data structures. The most important models are:

- `TextRequest`: model task input, including text, context, instruction, and style;
- `TextContext`: before/after context, document title, section heading, document id, and active scope;
- `TextAction`: one proposed document edit;
- `TaskResponse`: unified response for all tasks;
- `DocumentContextRequest`: document-level input from clients;
- `ContextBuildResult`: output of the context builder;
- `AgentSession`, `AgentSessionMessage`, and `AgentSessionMemory`: session, message, and memory models;
- `SubAgentCall`, `SubAgentResult`, and `AgentPlan`: subagent planning and execution structures.

This shared schema is central to maintainability. The frontend does not need to guess the model output format, and the backend can validate responses before they reach the UI.

### 5.7 Storage Layer

`app/storage.py` uses Python's standard `sqlite3` library for local persistence. The default database path is `data/word_ai.sqlite3`. Initialization creates three tables:

- `agent_sessions`: session id, title, creation time, and update time;
- `agent_messages`: user/assistant messages and the assistant's `TaskResponse` JSON;
- `agent_session_memory`: document summary, writing goals, key terms, and user preferences.

The storage layer supports creating sessions, listing sessions, deleting sessions, updating titles, reading and writing messages, reading memory, and upserting memory. Foreign keys are enabled, so deleting a session cascades to related messages and memory.

### 5.8 Prompt and Skill Layer

`app/prompts.py` loads prompt templates from `prompts/*.md` and formats `TextRequest` objects. Core prompt files include:

- `agent.md`: multi-turn writing assistant;
- `syntax.md`: grammar and proofreading;
- `word_choice.md`: word choice improvement;
- `style.md`: style rewriting;
- `formula.md`: formula and equation handling.

All tasks share a response contract that requires valid JSON and specifies the action schema. Skill files are stored in `skills/*.md`, including `proofread.md`, `academic-polish.md`, `summarize.md`, `translate-zh.md`, and `formula.md`. A prompt defines the base task behavior, while a skill is a runtime-composable domain instruction.

### 5.9 Subagent Registry

`app/subagents.py` defines the subagent registry. Each `SubAgentSpec` contains:

- the subagent name;
- the default skill file;
- a short instruction;
- allowed action types;
- whether to include history, memory, or full document context;
- maximum context length.

```text
Table 2. Preset subagents.
```

| Name | Skill file | Main role | Allowed action examples |
|---|---|---|---|
| `proofread` | `proofread.md` | Grammar, spelling, punctuation, clarity | replace, comment, highlight |
| `academic_polish` | `academic-polish.md` | Formal academic English polishing | replace, comment, ask_user |
| `summarize` | `summarize.md` | Concise summarization | comment, ask_user, none |
| `translate_zh` | `translate-zh.md` | Chinese-English translation | replace, comment |
| `formula` | `formula.md` | LaTeX and Word equations | equation replace, insert_equation |

If an unknown subagent name is provided, the system creates a custom subagent with a generic writing-assistant instruction. This makes the framework extensible.

## 6. Word Add-in Frontend

### 6.1 Manifest and Ribbon Commands

`word-addin/manifest.xml` declares the Word Web Add-in metadata, icons, permissions, and Ribbon buttons. The add-in requests `ReadWriteDocument` permission, allowing it to read the current selection and write back to the document. The Ribbon registers:

- `Syntax`: grammar checking;
- `Words`: word choice improvement;
- `Rewrite`: style rewriting;
- `Formula`: formula conversion;
- `Agent`: open the right-side task pane;
- `Skills`: manage skills;
- `Settings`: open settings.

The first four commands are suitable for one-shot editing tasks, while the Agent task pane supports multi-turn writing conversations.

### 6.2 Runtime Configuration

Word Add-in pages are served over HTTPS from the local static server. Because the backend port may change when the default port is occupied, `server.py` exposes `/runtime-config.json`. The frontend loads this file through `shared.js` and updates the API base URL dynamically. This avoids hard-coding the backend port in JavaScript.

### 6.3 Task Pane State

`taskpane.js` maintains the main UI state:

- `officeReady`: whether the pane is running inside Word;
- `currentSessionId`: the active agent session;
- `sending`: whether a request is in progress;
- `historyLoaded`: whether saved sessions have been loaded;
- `lastApplied`: the most recent applied edit, used for undo/review.

The task pane includes a health indicator, selection preview, session selector, chat log, input box, loading state, and error display.

### 6.4 Reading Word Context

The frontend uses Office.js `Word.run` to read the current selection and document body:

1. Call `context.document.getSelection()`.
2. Call `context.document.body`.
3. Load `selection.text` and `body.text`.
4. Use the selected text as the target when it is non-empty.
5. Fall back to the full document when no selection exists.
6. Locate the selection in the full body text and compute a local context preview.

The standardized context is still produced by the backend. The frontend sends `document_context`, and `/context/build` converts it into a `TextRequest`.

### 6.5 Agent Interaction Flow

When the user types a message and clicks Send, the task pane executes the following flow:

```text
Algorithm 1. Runtime flow for one agent turn.

1. Read the user message from the task pane.
2. Read current Word selection and full document text.
3. Ensure a backend session exists.
4. If this is a new session, call POST /agent/sessions.
5. Push current settings memory to PUT /agent/sessions/{id}/memory.
6. Build a request payload:
      message
      document_context
      active skills
      history_context_chars
      subagent settings
7. If auto subagents are enabled:
      call POST /subagents/plan
      show planned subagent status
8. If stepwise mode is selected:
      call POST /subagents/run for each subagent
      call POST /subagents/merge
   Else:
      call POST /agent/sessions/{id}/messages
9. Render reply, final_text, and actions.
10. If auto-apply is enabled and an applicable edit exists, apply the replacement.
11. Store lastApplied for undo/review.
12. Refresh selection preview and session list.
```

This flow shows that the Word Add-in is not just an HTTP form. It is a document-editing client with session, memory, subagent status, action rendering, and undo logic.

### 6.6 Applying Actions and Undo

When the backend returns `replace_selection`, the frontend can use Office.js to replace the current selection with the suggested replacement. If the source is the full document, it replaces the body; otherwise it replaces the selection. For formula actions, the frontend converts a LaTeX-like source into Word OOXML and inserts it with `insertOoxml`.

After applying an edit, the frontend stores the original text, replacement text, source scope, whether the action is a formula, and the UI row. The user can click Undo to restore the original text or Review to inspect before/after content. This interaction, combined with `requires_confirmation` and `risk_level`, forms the system's safety mechanism.

### 6.7 Settings and Skills UI

`settings.js` manages local UI settings and remote model configuration. Local settings are stored in `localStorage` and include language, font size, history context length, auto-apply behavior, action detail visibility, undo/review visibility, auto-subagent behavior, subagent execution mode, and memory text. Remote model settings are read and written through `/settings/ai-config`.

The settings page also provides presets for OpenAI, DeepSeek, and Qwen-style endpoints. The skills panel uses `/skills` APIs to manage markdown skill files at runtime.

## 7. Core Runtime Logic

### 7.1 Context Construction

`context_builder.py` connects Word document data to LLM prompts. It accepts a `DocumentContextRequest`:

```json
{
  "document_text": "...",
  "selection": {"text": "...", "start": 10, "end": 30},
  "active_scope": "selection | paragraph | section | document",
  "context_window_chars": 1200,
  "instruction": "...",
  "style": "..."
}
```

The builder first resolves the selection. If start/end offsets are provided, it uses them as the source of truth. If `selection.text` is also provided but does not match the offset slice, it returns a warning and keeps the offset slice. If no offsets exist but `selection.text` is available, it searches for that text in the document. If the text appears multiple times, it uses the first occurrence and returns a warning. If no selection is provided but document text exists, it falls back to the full document.

The builder then applies the active scope:

- `selection`: keep the current selection;
- `paragraph`: expand to paragraph boundaries;
- `document`: use the full document;
- `section`: currently not implemented, so the system warns and falls back to the current selection.

Finally, it slices before/after context windows and returns `ContextBuildResult`. This module ensures consistent context behavior across all clients.

### 7.2 Direct Task Flow

Direct tasks include syntax, word choice, style, and formula. Their flow is:

1. A client sends a `TextRequest`, or calls `/context/build` to create one.
2. The API layer calls the corresponding service.
3. The service loads the task prompt.
4. `format_text_request` inserts text, context, title, instruction, and style.
5. The response contract is appended.
6. `AIClient.complete_task` calls the model and parses the result as `TaskResponse`.
7. The frontend renders `actions` or `final_text`.

This direct task flow is the baseline from which the more complex agent flow is derived.

### 7.3 Agent Session Flow

The agent flow adds session state, history, and memory:

1. The client calls `POST /agent/sessions` to create a session.
2. The client may call `PUT /memory` to set document summary, writing goals, terms, and preferences.
3. The user sends a message to `POST /agent/sessions/{id}/messages`.
4. The backend reads the latest 50 messages.
5. The backend reads session memory.
6. If the request includes `document_context`, the backend runs the context builder.
7. If this is the first message and the title is empty, the backend derives a short title.
8. The backend stores the user message.
9. If no subagent is requested, the backend calls `run_agent_turn`.
10. The backend stores the assistant message and response JSON.
11. The response includes the session, user message, assistant message, and `TaskResponse`.

`run_agent_turn` combines history, memory, active skills, and the latest user message before building the agent prompt. To avoid overly long prompts, history is truncated using `history_context_chars`.

### 7.4 Subagent Dispatch Flow

Subagents can be invoked in three ways.

The first mode is an explicit list:

```json
{
  "message": "Proofread and polish this paragraph.",
  "subagents": ["proofread", "academic_polish"]
}
```

The second mode is automatic planning. The request sets `auto_subagents=true`, and the backend calls `plan_subagents`. The planner sees available subagents, skills, the user message, and a selected-text preview, then returns up to three `SubAgentCall` objects. The backend filters out missing skills and invalid calls.

The third mode is planned subagents. A client first calls `/subagents/plan`, optionally reviews the plan, and then passes approved calls as `planned_subagents`.

When running a subagent, the backend:

1. Resolves a `SubAgentSpec` by name.
2. Inserts the subagent short instruction.
3. Inserts allowed action types.
4. Loads the default skill or selected skills.
5. Formats selected text, metadata, and before/after context according to context mode.
6. Adds subagent output rules and the response contract.
7. Calls the model and receives a `TaskResponse`.
8. Prefixes the summary with the subagent name.
9. Returns the result.

Multiple subagent outputs are first merged by rule:

- replies are joined with blank lines;
- actions are collected;
- final text is taken from the last non-null result;
- summaries are concatenated.

When `llm_merge_subagents=true`, the merged result is sent to the main agent for conflict reconciliation.

### 7.5 Stepwise and Parallel Subagent Modes

The Word Add-in supports two stepwise execution modes:

- pipeline: the output of one subagent becomes the input of the next;
- parallel: multiple subagents run independently on the original document context and are merged afterward.

Pipeline mode is suitable for sequential tasks such as "proofread first, then polish." Parallel mode is suitable for independent tasks such as summarization and comments. The backend exposes `/subagents/run` and `/subagents/merge` to support this fine-grained control.

### 7.6 Formula Handling

Formula handling has both backend and frontend components. The backend prompt can ask the model to return `replace_selection_equation` or `insert_equation`, with formula source stored in `formula` and `formula_format` usually set to `latex`. The frontend converts the LaTeX-like string into Word OOXML and inserts it through Office.js. The current parser supports basic fractions, square roots, subscript/superscript, several Greek letters, and common operators. Complex formulas remain future work.

## 8. Implementation Details

### 8.1 Technology Stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI |
| ASGI server | Uvicorn |
| Data validation | Pydantic v2 |
| HTTP client | httpx |
| LLM SDK | OpenAI-compatible AsyncOpenAI |
| Local storage | SQLite |
| Word integration | Office.js Word Web Add-in |
| Packaging | PyInstaller specs and installer scripts |
| Testing | pytest, FastAPI TestClient, mock AI clients |

### 8.2 Repository Organization

```text
app/                  Backend Python package
  main.py             FastAPI routes
  services.py         Business logic and subagent execution
  ai_client.py        Model gateway and JSON parsing
  context_builder.py  Document context normalization
  models.py           Pydantic schemas
  storage.py          SQLite session and memory store
  prompts.py          Prompt loading and formatting
  subagents.py        Subagent registry

prompts/              Base prompt templates
skills/               Runtime-editable skill markdown files
word-addin/           Word Web Add-in frontend
scripts/              Start, test, certificate, and installer utilities
tests/                Unit tests and scenario files
examples/simple-web/  Browser demo
server.py             Unified packaged server entry point
```

### 8.3 Error Handling

The system handles errors at several levels:

- incomplete AI configuration returns HTTP 503;
- model connection failure or model-side HTTP errors become HTTP 502;
- invalid model JSON becomes HTTP 502;
- invalid selection offsets become HTTP 400;
- missing sessions become HTTP 404;
- invalid skill names become HTTP 400;
- frontend request failures are displayed in the task pane error box.

This layered error handling makes debugging easier and prevents unsafe model outputs from reaching the document UI.

### 8.4 Security and User Control

The system's safety strategy has three main parts:

1. API keys are not committed to Git; real credentials remain in local `.env`.
2. All document edits are represented as actions, and edits default to `requires_confirmation=true`.
3. Risk levels allow the frontend to treat document-wide or meaning-changing edits more carefully.

The current system is a local development application. It allows broad CORS access for convenience. A production deployment should restrict CORS, add authentication, and implement stricter document-data protection.

## 9. Experiments and Evaluation

### 9.1 Evaluation Goals

Because this project focuses on software architecture and LLM packaging, evaluation is divided into:

- **Engineering correctness**: whether APIs, schemas, context building, sessions, memory, subagents, and Word action data flow work correctly.
- **Writing quality**: whether real model outputs preserve meaning, correct errors, match academic style, and satisfy users.

The current project mainly covers engineering correctness. Writing-quality evaluation requires real model runs, human annotation, and a larger set of test texts.

### 9.2 Unit Tests for Subagents

`tests/test_subagents.py` uses a mock AI client to isolate model randomness. The test command is:

```powershell
$tmp = Join-Path (Get-Location) '.tmp\pytest'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TMP = $tmp
$env:TEMP = $tmp
pytest -q
```

The result is:

```text
11 passed, 1 warning
```

The tests cover:

- original agent flow when no subagent is requested;
- skill injection for a single `proofread` subagent;
- action and final-text merging for multiple subagents;
- custom subagent names;
- selected skills reaching the main agent prompt;
- default omission of full history from subagent prompts;
- explicit disabling of full skill prompts;
- auto-planning and missing-skill filtering;
- newly added non-preset skills;
- stepwise run/merge endpoints;
- history truncation during LLM merge.

These tests show that subagents are implemented as a verifiable software component rather than only as a conceptual prompt idea.

### 9.3 Fixed Agent Flow Test

`scripts/test_agent_flow.py --mock` validates an end-to-end agent flow using a fixed methods-section paragraph. The script tests:

1. `GET /health`;
2. `POST /context/build`;
3. `POST /agent/sessions`;
4. `PUT /agent/sessions/{id}/memory`;
5. `POST /agent/sessions/{id}/messages`;
6. `GET /agent/sessions/{id}/messages`;
7. `DELETE /agent/sessions/{id}`.

The selected sentence is:

```text
This method is good and useful.
```

The context builder returns before=120 characters and after=214 characters while preserving the selected text. The mock agent returns a Chinese explanation, an English rewrite, a `replace_selection` action, and a low-risk label. This verifies the complete path from context construction to memory injection, agent response, message storage, and cleanup.

### 9.4 Multi-Turn Scenario Test

`scripts/agent_scenario_test.py --mock` runs a three-turn scenario from `tests/scenarios/academic_rewrite.zh-CN.json`:

1. The user asks for an explanation and a more formal English rewrite.
2. The user asks for a more concise version based on the previous explanation.
3. The user asks again while emphasizing that the scientific meaning should not change.

The result is:

```text
Scenario test passed.
Saved messages: 2 -> 4 -> 6
```

This confirms that the session stores multi-turn user/assistant messages, memory and document context are injected into each turn, and the action schema remains valid across turns.

### 9.5 Ablation-Style Analysis

Following the course writing guideline, we analyze not only what the system contains, but also what would fail without each design choice.

```text
Table 3. Design choices and expected failures without them.
```

| Design choice | If removed | Evidence in project |
|---|---|---|
| Context builder | Clients would build inconsistent context; repeated selections and offset mismatches would be fragile | `/context/build` and flow test |
| `TaskResponse` schema | The frontend could not reliably distinguish reply, final text, and actions | Pydantic validation and tests |
| `requires_confirmation` | The model could overwrite documents without user control | action schema and taskpane logic |
| Session storage | Multi-turn history and assistant responses would be lost | scenario message count |
| Session memory | Writing goals and terminology preferences would need to be repeated every turn | memory injection tests |
| Subagents | Compound tasks would be mixed into one unclear prompt | 11 subagent tests |
| Stepwise run/merge | The frontend could not inspect individual subagent outputs | `/subagents/run` and `/merge` |
| Runtime config | Packaged add-in pages would use stale hard-coded API ports | `runtime-config.json` |

This analysis shows that the final architecture is not a random list of features. It is derived from the limitations of the baseline.

## 10. Discussion

### 10.1 What Worked Well

The most successful design is the separation between model output and document modification. The model proposes edits, while the frontend previews, confirms, applies, and can undo them. This is safer and more suitable for human-AI writing collaboration than directly inserting generated text into Word.

The backend context builder is also effective. Word, CLI, and Web demo clients may provide different input formats, but once the backend normalizes them into `TextRequest`, the prompt format remains stable.

The subagent design is intentionally lightweight. The project does not introduce a heavy external agent framework. Instead, registry, planning, skill injection, allowed actions, and merge logic are implemented inside the existing FastAPI service layer. This makes the mechanism controllable and easy to test.

### 10.2 Limitations

The current system has several limitations. First, real model quality has not been evaluated systematically. Mock tests validate engineering flow, not writing quality. Second, Word document structure is only partially used. The system mainly works with plain text, selections, and body text, and does not yet fully use headings, comments, footnotes, references, tables, or equation objects. Third, the formula parser only covers basic LaTeX constructs. Fourth, section scope is not yet implemented and currently falls back to the selection with a warning. Fifth, the system remains a local development application rather than a polished end-user product.

### 10.3 Lessons Learned

The main lesson is that a prompt is only one part of an LLM application. The usability of a writing assistant depends heavily on schema design, context management, error handling, state persistence, and UI control. A powerful model is still difficult to integrate into Word without structured outputs. A good prompt still struggles with long-running writing tasks without session memory. A system that generates good rewrites is still unsafe if it cannot preview, confirm, and undo edits.

## 11. Future Work

Future work can proceed in five directions:

1. **Real writing-quality evaluation**: build a dataset for grammar errors, academic polishing, terminology preservation, and formula conversion, then collect human ratings.
2. **Deeper Word structure parsing**: use heading hierarchy, tables, captions, comments, and equation objects in the context builder.
3. **More reliable action localization**: improve range-level targeting, anchor matching, and conflict detection.
4. **Memory update proposals**: let the model propose memory updates, but require user confirmation before applying them.
5. **Deployment and security**: improve installer behavior, certificate trust, update flow, CORS restrictions, and sensitive-data protection.

## 12. Conclusion

This paper presents Word AI Assistant, a controllable LLM writing assistant for Microsoft Word. The system is built around real document-editing needs and includes a Word Add-in frontend, FastAPI backend, context builder, model gateway, SQLite session store, skill system, and subagent dispatch framework. Compared with a simple prompt baseline, the final system can read document context, maintain multi-turn memory, decompose compound tasks, return structured actions, and preview, apply, and undo edits inside Word.

Automated tests verify the key engineering paths: 11 subagent unit tests pass, and both the fixed agent-flow mock test and the three-turn scenario mock test pass. Although real model-quality evaluation remains future work, the project demonstrates the core software design needed to package a general LLM as a controllable document-writing tool. Its value is not merely that it calls a model, but that it provides a verifiable and extensible framework for human-controlled AI writing assistance.

## References

[1] `README.md`, Word AI Backend project documentation.  
[2] `server.py`, unified startup for FastAPI backend and Word Add-in HTTPS static server.  
[3] `app/main.py`, FastAPI API, agent session, and skill management endpoints.  
[4] `app/services.py`, task execution, agent turn, subagent dispatch, and merge logic.  
[5] `app/ai_client.py`, OpenAI-compatible SDK and direct endpoint model gateway.  
[6] `app/context_builder.py`, document context construction and selection resolution.  
[7] `app/models.py`, `TextRequest`, `TaskResponse`, `TextAction`, and agent data models.  
[8] `app/storage.py`, SQLite session, message, and memory persistence.  
[9] `app/subagents.py`, subagent registry and skill-file mapping.  
[10] `app/prompts.py` and `prompts/*.md`, prompt loading, formatting, and response contract.  
[11] `skills/*.md`, extensible skill instruction files.  
[12] `word-addin/manifest.xml`, Office Add-in manifest and Ribbon configuration.  
[13] `word-addin/taskpane.js`, task pane, agent conversation, action application, and undo/review.  
[14] `word-addin/settings.js` and `word-addin/shared.js`, settings UI, runtime config, and local state.  
[15] `tests/test_subagents.py`, subagent automated tests.  
[16] `scripts/test_agent_flow.py` and `scripts/agent_scenario_test.py`, fixed-flow and multi-turn scenario tests.  
[17] `Project Writing Guidelines.docx`, course project writing guideline.

## Appendix A. API Request Examples

### A.1 Syntax Task

```json
{
  "text": "He dont know what to did yesterday.",
  "context": {
    "before": "",
    "after": ""
  },
  "instruction": ""
}
```

### A.2 Agent Turn with Document Context

```json
{
  "message": "Explain the issue in the selected sentence and provide a more formal English rewrite.",
  "document_context": {
    "title": "Draft Methods Section",
    "section_heading": "Methods",
    "document_text": "Title: Draft Methods Section\\n\\nThis method is good and useful...",
    "selection": {
      "text": "This method is good and useful."
    },
    "active_scope": "selection",
    "context_window_chars": 300,
    "instruction": "Keep the final rewrite suitable for an academic methods section."
  }
}
```

### A.3 Explicit Subagent Dispatch

```json
{
  "message": "Check grammar and improve academic tone.",
  "selection": {
    "text": "This method is good and useful."
  },
  "subagents": ["proofread", "academic_polish"]
}
```

## Appendix B. Verification Commands

```powershell
$tmp = Join-Path (Get-Location) '.tmp\pytest'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TMP = $tmp
$env:TEMP = $tmp
pytest -q
```

Result: `11 passed, 1 warning`.

```powershell
python .\scripts\test_agent_flow.py --mock
```

Result: `Agent flow test passed`.

```powershell
python .\scripts\agent_scenario_test.py --mock
```

Result: `Scenario test passed`.

## Appendix C. End-to-End Runtime Trace

A typical Word agent editing request proceeds as follows:

1. The user selects a sentence in Word.
2. The user opens the Word AI Agent task pane.
3. The frontend reads the selection and body text through Office.js.
4. The frontend creates or reuses a backend session.
5. The frontend writes the current settings memory into the session.
6. The frontend sends `message` and `document_context`.
7. The backend runs the context builder and creates `TextRequest`.
8. The backend reads history and memory.
9. If auto subagents are enabled, the backend plans subagents.
10. The backend runs the main agent or multiple subagents.
11. The backend merges results and stores the assistant message.
12. The frontend renders reply, summary, final text, and actions.
13. The user previews the action.
14. The user clicks Apply, or the system auto-applies according to settings.
15. The frontend saves `lastApplied`.
16. The user can click Undo to restore the original text or Review to inspect before/after content.
