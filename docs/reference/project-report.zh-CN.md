# Word AI Assistant：面向 Microsoft Word 的可控大语言模型写作助手系统

作者：请填写姓名与学号  
单位：请填写学院 / 专业 / 课程信息  
课程：BME1320  
日期：2026 年 6 月 27 日

## Abstract

大语言模型已经能够完成语法检查、学术润色、翻译和摘要等文本任务，但将其直接接入 Microsoft Word 等真实写作环境仍然面临上下文获取、结构化编辑、安全确认、多轮记忆和复合任务拆解等工程挑战。本文介绍 Word AI Assistant，一个面向 Word/WPS 写作场景的 AI 写作助手系统。系统采用 FastAPI 后端、SQLite 会话存储、统一 `TaskResponse` 响应结构、文档上下文构建器、可扩展 skill 文件、subagent 调度机制以及 Word Web Add-in 前端。与简单的“选中文本发送给模型”方案不同，本系统将模型输出封装为可预览、可确认、可撤销的编辑 action，并通过 agent session 和 memory 支持连续写作任务。本文按照 AAAI 风格的系统论文结构，系统描述项目背景、软件框架、核心功能、运行逻辑、实验验证和局限性。自动化测试结果显示，当前系统的 subagent 流程、上下文构建、会话持久化、结构化 action 和多轮 mock 场景均能稳定运行。项目表明，构建可靠的 LLM 写作助手不仅依赖模型能力，也依赖围绕文档编辑场景设计的控制层、接口层和交互层。

## 1. Introduction

学术写作是生物医学工程学习和科研训练中的核心任务。学生在撰写课程 project、实验报告、方法部分或结果分析时，不仅需要保证语法正确，还需要使用准确术语、保持学术语气、避免改变科学含义，并在必要时处理公式、符号和中英双语表达。传统拼写检查和语法检查工具通常只能处理局部错误，而通用聊天机器人虽然能提供更丰富的改写建议，却往往脱离用户当前文档环境，难以直接作用于 Word 中的选区、段落或全文。

一个真正可用的 Word AI 写作助手需要解决多个问题。首先，系统必须理解文档上下文。用户选中一句话时，这句话可能来自摘要、方法、结果或讨论部分，不同位置对应不同的写作目标。其次，系统必须以安全方式修改文档。模型不应直接静默覆盖用户内容，而应返回可审查的编辑建议，包括原文、替换文本、修改理由、风险等级和是否需要确认。第三，真实用户请求往往是多轮的。用户可能先要求解释问题，再要求更简洁版本，最后强调不要改变 scientific meaning。第四，写作任务往往是复合型的。例如“检查语法并改成更正式的学术表达”同时包含 proofread 和 academic polish 两个目标，如果只使用一个混合 prompt，模型可能过度改写或遗漏局部错误。

基于这些挑战，本项目构建了 Word AI Assistant。系统的目标不是训练一个新的语言模型，而是研究如何把通用 LLM 封装为一个可控、可扩展、可嵌入 Word 的写作辅助系统。项目从一个简单 baseline 出发：给定文本、固定 prompt、模型返回结果。随后逐步加入上下文构建、结构化响应、会话记忆、subagent 调度、skill 管理和 Word 插件集成，形成完整的软件框架。

本文的主要贡献如下：

- 提出并实现了一个面向 Word 文档编辑的 LLM 写作助手架构，覆盖后端 API、模型调用、会话存储、前端插件和打包启动流程。
- 设计了统一的 `TaskResponse` 和 `TextAction` schema，将自然语言模型输出转化为可预览、可确认、可撤销的文档编辑动作。
- 实现了文档上下文构建器，将 Word 选区、全文、段落范围、before/after 上下文和用户 instruction 规范化为模型输入。
- 引入 agent session 与显式 session memory，用于保存文档摘要、写作目标、关键术语和用户偏好，从而支持多轮写作任务。
- 设计并验证了 subagent 调度框架，支持显式 subagent、自动规划 subagent、分步 run/merge 和 LLM merge。
- 实现 Word Web Add-in 前端，使系统能够读取 Word 选区、发送 document context、展示 action、应用改写、插入公式并支持 undo/review。

## 2. Related Work and Background

### 2.1 LLM-Based Writing Assistance

LLM 写作助手通常以自然语言输入和自然语言输出为核心，能够进行语法纠错、改写、翻译、摘要和问答。对于普通聊天场景，这种模式已经足够；但对于文档编辑场景，系统不仅要回答“应该如何改”，还要告诉客户端“改哪里、怎么改、是否安全、是否需要确认”。因此，本项目更关注 LLM 的系统封装方式，而非单个 prompt 的文本生成效果。

### 2.2 Document-Centered Human-AI Interaction

Word 等文档编辑器与普通聊天窗口不同。文档本身具有结构，包括标题、段落、选区、公式、批注和上下文。用户的交互也不是一次性问答，而是“选择文本 -> 获取建议 -> 预览 -> 应用或撤销 -> 继续追问”。因此，系统必须把 AI 输出融入编辑器的交互逻辑，而不是让用户手动复制粘贴。

### 2.3 Agent and Tool-Oriented Design

Agent 式系统强调多轮上下文、任务分解和外部工具调用。本项目中的 agent 不是复杂的自主规划机器人，而是一个轻量级写作 agent：它读取当前选区、会话历史和 memory，判断用户意图是查询还是编辑，并返回结构化 action。Subagent 机制进一步把复合任务拆分为 proofread、academic polish、summarize、translate 和 formula 等专门子任务，从而降低单一 prompt 的职责混杂。

## 3. Problem Formulation

我们将 Word AI Assistant 的核心任务定义为结构化文档写作辅助任务。给定：

- 用户消息 `message`；
- 当前选中文本或文档范围 `selection`；
- 文档上下文 `document_context`，包括全文、标题、章节标题、选区 offset 和上下文窗口；
- 会话历史 `history`；
- 显式会话记忆 `memory`；
- 可选 skill 和 subagent 配置；

系统需要输出一个 `TaskResponse`：

```json
{
  "task": "syntax | word_choice | style | formula | agent",
  "reply": "面向用户的解释或回答",
  "summary": "一句话摘要或 null",
  "actions": [],
  "final_text": "完整改写结果或 null",
  "subagent_calls": []
}
```

其中 `actions` 是系统可落地的关键。每个 action 描述一次建议操作，包括：

- `type`：例如 `replace_selection`、`replace_range`、`add_comment`、`insert_equation`、`ask_user`；
- `target`：作用范围，例如 selection、range、paragraph、section、document 或 cursor；
- `original` 和 `replacement`：修改前后文本；
- `preview`：用于 UI 预览的 before/after；
- `reason`：修改原因；
- `risk_level`：info、low、medium 或 high；
- `requires_confirmation`：是否要求用户确认。

这种 formulation 把写作助手从普通问答系统变成文档编辑系统。模型不再只是生成一段文本，而是生成一组可审查的编辑建议。

## 4. System Overview

Word AI Assistant 采用前后端分离、后端统一调度的设计。整体架构如 Figure 1 所示。

```text
Figure 1. Overall architecture.

Microsoft Word
  └── Word Web Add-in
        ├── Ribbon commands: Syntax / Words / Rewrite / Formula / Agent / Settings
        ├── Task pane: chat, action preview, apply, undo, review
        └── Settings pane: model config, memory, UI behavior, subagents

Local unified server
  ├── HTTPS static server for add-in pages
  └── FastAPI backend
        ├── API layer: app.main
        ├── Service layer: app.services
        ├── Prompt layer: app.prompts + prompts/*.md
        ├── Model gateway: app.ai_client
        ├── Context builder: app.context_builder
        ├── Session storage: app.storage + SQLite
        ├── Subagent registry: app.subagents + skills/*.md
        └── Data schema: app.models
```

系统包含三个主要入口：

1. **Word Add-in**：真实用户界面，读取 Word 选区或全文，向后端发送请求，并把模型返回的 action 应用到文档。
2. **HTTP CLI**：调试入口，用命令行模拟前端请求，便于验证 API、context builder、agent session 和 skill 行为。
3. **Simple Web Demo**：轻量 Web 文本编辑器，用于在不打开 Word 的情况下演示 agent 数据流。

这种多入口设计的核心思想是：不同客户端共享同一个后端 API、同一套 prompt、同一个 response schema 和同一套会话存储。这样既方便调试，也避免 Word 插件、Web demo 和 CLI 各自维护不同逻辑。

## 5. Software Framework

### 5.1 Unified Server Entry Point

`server.py` 是打包后的统一启动入口。它在一个进程中启动两个服务：

- FastAPI 后端，默认监听 `127.0.0.1:8000`；
- Word Add-in 静态文件 HTTPS 服务，默认监听 `https://localhost:3443`。

启动逻辑如下：

1. 读取命令行参数 `--api-port` 和 `--ui-port`，或环境变量 `WORD_AI_API_PORT`、`WORD_AI_UI_PORT`。
2. 检查端口是否被占用。如果默认端口已被占用，系统会寻找后续可用端口。
3. 根据当前是否为 PyInstaller frozen 环境确定资源目录。
4. 查找 `.certs` 或 `certs` 目录中的 `localhost.pem` 和 `localhost-key.pem`。
5. 启动 HTTPS 静态服务器，为 Word Add-in 提供 `taskpane.html`、`settings.html`、`commands.html` 和图标资源。
6. 动态生成 `/runtime-config.json`，把后端 API 地址传给前端。
7. 初始化并启动 `uvicorn app.main:app`。

这个入口解决了 Word 插件的本地 HTTPS 加载需求，也让打包后的应用可以通过一个可执行文件同时提供 UI 和 API。

### 5.2 Configuration Layer

`app/config.py` 负责模型配置和数据目录。它支持以下配置项：

| 配置项 | 作用 |
|---|---|
| `OPENAI_API_KEY` | 模型 API key |
| `OPENAI_MODEL` | 模型名称 |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL |
| `OPENAI_API_ENDPOINT` | 学校 GenAI gateway direct endpoint |
| `OPENAI_PROXY_URL` | 可选代理 |
| `OPENAI_TRUST_ENV` | 是否读取系统代理环境变量 |
| `OPENAI_USE_JSON_MODE` | 是否启用 JSON mode |

普通源码运行时，数据目录默认是项目根目录；打包环境下，数据目录优先从 Windows registry 获取，否则使用 `%APPDATA%\Word AI Assistant`。这样可以把 `.env`、SQLite 数据库和用户设置放在可写位置，而不是写入只读安装目录。

### 5.3 API Layer

`app/main.py` 是 FastAPI 应用入口。它在 lifespan 中完成三件事：

1. 从 `.env` 读取 `AISettings`；
2. 如果配置完整，则初始化 `AIClient`；
3. 初始化 `AgentSessionStore`，创建 SQLite 表。

API 层的职责是接收 HTTP 请求、验证 Pydantic 模型、调用 service layer，并把异常转换成合适的 HTTP 错误。主要接口如 Table 1 所示。

```text
Table 1. Major HTTP endpoints.
```

| Endpoint | Method | Function |
|---|---:|---|
| `/health` | GET | 检查服务状态和 AI 配置 |
| `/settings/ai-config` | GET/PUT | 读取或更新模型配置 |
| `/tasks/syntax` | POST | 语法、拼写、标点和清晰度检查 |
| `/tasks/word-choice` | POST | 用词和短语优化 |
| `/tasks/style` | POST | 按目标风格改写 |
| `/tasks/formula` | POST | LaTeX、公式和 Word equation 处理 |
| `/context/build` | POST | 将文档上下文转换为 `TextRequest` |
| `/agent/sessions` | POST/GET | 创建或列出 agent session |
| `/agent/sessions/{id}` | GET/DELETE | 读取或删除 session |
| `/agent/sessions/{id}/messages` | GET/POST | 读取历史消息或发送一轮 agent 消息 |
| `/agent/sessions/{id}/memory` | GET/PUT | 读取或更新 session memory |
| `/agent/sessions/{id}/subagents/plan` | POST | 规划 subagent 调用 |
| `/agent/sessions/{id}/subagents/run` | POST | 单独运行一个 subagent |
| `/agent/sessions/{id}/subagents/merge` | POST | 合并 subagent 结果 |
| `/skills` | GET/POST | 列出或创建 skill |
| `/skills/{name}` | GET/PUT/DELETE | 读取、更新或删除 skill |

### 5.4 Service Layer

`app/services.py` 是业务核心。它将 HTTP request 转换为 prompt，并调用 `AIClient` 得到结构化结果。主要函数包括：

- `run_syntax`：构建 syntax prompt，并返回语法检查结果；
- `run_word_choice`：构建 word-choice prompt，并返回用词建议；
- `run_style`：构建 style prompt，并返回风格改写；
- `run_formula`：构建 formula prompt，并把 response task 标记为 formula；
- `run_agent_turn`：构建多轮 agent prompt，注入 history、memory、skills 和当前 selection；
- `plan_subagents`：调用 planner prompt，让模型决定是否需要 subagent；
- `run_subagent_turn`：运行某个 subagent，注入对应 skill 和 allowed actions；
- `merge_subagent_results`：规则式合并多个 subagent 的 reply、actions、summary 和 final_text；
- `merge_subagent_results_with_llm`：通过额外 LLM 调用协调冲突，生成统一响应。

服务层的存在让 API 层保持轻量，也让 CLI、Word 插件和 Web demo 间接复用同一套业务逻辑。

### 5.5 Model Gateway

`app/ai_client.py` 封装模型调用。系统支持两种模式：

1. 标准 OpenAI-compatible SDK 模式：使用 `AsyncOpenAI`，配置 `base_url`、`api_key` 和 `model`；
2. Direct endpoint 模式：使用 `httpx.AsyncClient` 直接向学校 GenAI gateway 发请求。

调用流程如下：

1. 构造 system message 和 user prompt。
2. 设置较低 temperature，降低输出随机性。
3. 如果 `use_json_mode=true`，则请求 JSON object response format。
4. 如果模型或网关不支持 JSON mode，回退到普通调用。
5. 提取模型输出文本。
6. 去除可能的 Markdown code fence。
7. 使用 `json.loads` 解析。
8. 使用 Pydantic 模型验证结构，例如 `TaskResponse` 或 `AgentPlan`。

如果模型返回空内容、非法 JSON 或不符合 schema，系统会抛出 `AIClientError`，API 层将其转换为 502 错误。这个机制避免前端接收到半结构化、无法应用的结果。

### 5.6 Data Model Layer

`app/models.py` 定义系统共享数据结构。最重要的模型包括：

- `TextRequest`：模型任务输入，包括 text、context、instruction 和 style。
- `TextContext`：before/after 上下文、文档标题、章节标题、document id 和 active scope。
- `TextAction`：一次文档编辑建议。
- `TaskResponse`：所有任务的统一响应。
- `DocumentContextRequest`：客户端发送的文档级上下文。
- `ContextBuildResult`：上下文构建结果。
- `AgentSession`、`AgentSessionMessage` 和 `AgentSessionMemory`：会话、消息和记忆。
- `SubAgentCall`、`SubAgentResult` 和 `AgentPlan`：subagent 调度结构。

这种统一 schema 是系统可维护性的关键。前端不需要猜测模型返回格式，后端也能在模型响应进入 UI 之前进行结构校验。

### 5.7 Storage Layer

`app/storage.py` 使用 Python 标准库 `sqlite3` 管理本地持久化。数据库默认路径是 `data/word_ai.sqlite3`。初始化时创建三张表：

- `agent_sessions`：保存 session id、标题、创建时间和更新时间；
- `agent_messages`：保存每轮 user/assistant 消息和 assistant 的 `TaskResponse` JSON；
- `agent_session_memory`：保存 document summary、writing goals、key terms 和 user preferences。

存储层支持创建 session、列出 session、删除 session、更新标题、读写消息、读取 memory 和 upsert memory。由于启用了 SQLite foreign key，删除 session 时相关 message 和 memory 会级联删除。

### 5.8 Prompt and Skill Layer

`app/prompts.py` 负责加载 `prompts/*.md` 并拼接输入。核心 prompt 文件包括：

- `agent.md`：多轮写作助手；
- `syntax.md`：语法检查；
- `word_choice.md`：用词优化；
- `style.md`：风格改写；
- `formula.md`：公式处理。

所有任务共享一个 response contract，要求返回合法 JSON，并明确 action schema。Skill 文件位于 `skills/*.md`，例如 `proofread.md`、`academic-polish.md`、`summarize.md`、`translate-zh.md` 和 `formula.md`。Skill 与 prompt 的区别在于：prompt 是任务类型的基础规则，skill 是可运行时组合的领域指令。

### 5.9 Subagent Registry

`app/subagents.py` 定义 subagent 注册表。每个 `SubAgentSpec` 包含：

- subagent 名称；
- 默认 skill 文件；
- 简短 instruction；
- 允许返回的 action types；
- 是否包含 history、memory 或完整 document context；
- 最大上下文字符数。

预设 subagent 如 Table 2 所示。

```text
Table 2. Preset subagents.
```

| Name | Skill file | Main role | Allowed action examples |
|---|---|---|---|
| `proofread` | `proofread.md` | 语法、拼写、标点、清晰度 | replace, comment, highlight |
| `academic_polish` | `academic-polish.md` | 学术英语润色 | replace, comment, ask_user |
| `summarize` | `summarize.md` | 摘要和概括 | comment, ask_user, none |
| `translate_zh` | `translate-zh.md` | 中英翻译 | replace, comment |
| `formula` | `formula.md` | 公式和 LaTeX | equation replace, insert_equation |

如果传入未知 subagent 名称，系统不会直接失败，而是创建一个 custom subagent，使用通用写作助手 instruction。这一设计提高了扩展性。

## 6. Word Add-in Frontend

### 6.1 Manifest and Ribbon Commands

`word-addin/manifest.xml` 声明了 Word Web Add-in 的基本信息、图标、权限和 Ribbon 按钮。插件使用 `ReadWriteDocument` 权限，因此可以读取选区和写回文档。Ribbon 中注册了以下入口：

- `Syntax`：语法检查；
- `Words`：用词优化；
- `Rewrite`：风格改写；
- `Formula`：公式转换；
- `Agent`：打开右侧 agent task pane；
- `Skills`：管理 skill；
- `Settings`：打开设置窗口。

前三类快捷任务适合一次性修改当前选区；Agent task pane 则适合多轮对话式写作。

### 6.2 Runtime Configuration

Word 插件页面通过 HTTPS 从本地静态服务器加载。由于 API 端口可能因冲突而变化，`server.py` 提供 `/runtime-config.json`，前端通过 `shared.js` 加载运行时配置，并设置 API base URL。这样插件不需要把后端端口写死在 JavaScript 中。

### 6.3 Task Pane State

`taskpane.js` 维护主要 UI 状态：

- `officeReady`：当前是否在 Word 环境中；
- `currentSessionId`：当前 agent session；
- `sending`：是否正在请求后端；
- `historyLoaded`：是否加载过历史 session；
- `lastApplied`：最近一次应用的修改，用于 undo/review。

Task pane 主要元素包括 health status、选区预览、历史 session 下拉框、chat log、agent input、loading 状态和 error box。

### 6.4 Reading Word Context

前端使用 Office.js 的 `Word.run` 读取当前选区和全文：

1. `context.document.getSelection()` 获取当前 selection；
2. `context.document.body` 获取全文；
3. 加载 `selection.text` 和 `body.text`；
4. 如果有选区，则使用选区作为目标文本；
5. 如果没有选区，则退化为全文；
6. 在全文中定位选区，并截取前后约 500 字符作为本地 context preview。

真正的标准化上下文仍由后端 `/context/build` 完成。前端发送的是 `document_context`，后端负责变成 `TextRequest`。

### 6.5 Agent Interaction Flow

当用户在 task pane 输入消息并点击 Send 时，前端执行如下流程：

```text
Algorithm 1. Runtime flow for one agent turn.

1. Read user message from task pane.
2. Read current Word selection and full document text.
3. Ensure backend session exists.
4. If this is a new session, create POST /agent/sessions.
5. Push current settings memory to PUT /agent/sessions/{id}/memory.
6. Build request payload:
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
9. Render reply, final_text and actions.
10. If auto-apply is enabled and action is safe enough, apply replacement.
11. Store lastApplied for undo/review.
12. Refresh selection preview and session list.
```

这个流程说明 Word 插件并不是一个简单 HTTP 表单，而是一个完整的编辑交互客户端。

### 6.6 Applying Actions and Undo

如果后端返回 `replace_selection`，前端可以使用 Office.js 将 replacement 写回当前选区。如果当前 source 是 document，则替换整个 body；否则替换 selection。对于公式 action，前端将 LaTeX-like source 转成 OOXML，并通过 `insertOoxml` 插入 Word 公式。

应用修改后，前端会保存：

- 原始文本；
- 替换文本；
- source 是 selection 还是 document；
- 是否为公式 action；
- 对应 UI 行。

用户可以点击 Undo，把原始文本写回文档；也可以点击 Review，打开对话框查看 before/after。这种交互与 `requires_confirmation` 和 `risk_level` 共同构成安全编辑机制。

### 6.7 Settings and Skills UI

`settings.js` 管理本地 UI 设置和远程模型配置。本地设置保存于 `localStorage`，包括语言、字体大小、history context 长度、是否自动应用、是否显示 action details、是否显示 undo/review、是否启用 auto subagents、subagent 执行模式以及 memory 文本。远程模型配置通过 `/settings/ai-config` 读写 `.env`。

Settings 页面还提供 OpenAI、DeepSeek 和 Qwen 等 preset，用于快速填充 base URL、endpoint、model 和 JSON mode 设置。Skills 页面则通过 `/skills` API 管理 markdown skill 文件，实现运行时扩展。

## 7. Core Runtime Logic

### 7.1 Context Construction

`context_builder.py` 是连接 Word 文档和 LLM prompt 的关键模块。它接受 `DocumentContextRequest`：

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

系统先解析 selection。如果提供了 start/end，则优先使用 offset；如果同时提供 selection.text 且与 offset 切片不一致，系统返回 warning 并使用 offset。如果没有 offset 但有 selection.text，系统在 document_text 中查找该文本；若出现多次，则使用第一次并返回 warning。若没有 selection 但有全文，则使用全文。

之后根据 active scope 调整目标文本：

- `selection`：保持当前选区；
- `paragraph`：扩展到当前段落边界；
- `document`：使用全文；
- `section`：当前版本尚未实现，会 warning 并退化为 selection。

最后系统截取 before/after 上下文，并返回 `ContextBuildResult`。这个模块确保不同客户端对选区和上下文的理解一致。

### 7.2 Direct Task Flow

直接任务包括 syntax、word choice、style 和 formula。它们的运行逻辑如下：

1. 客户端发送 `TextRequest` 或由 `/context/build` 生成 `TextRequest`；
2. API 层调用对应 service；
3. service 加载任务 prompt；
4. `format_text_request` 把文本、上下文、标题、instruction 和 style 拼入输入；
5. 附加 response contract；
6. `AIClient.complete_task` 调用模型并解析为 `TaskResponse`；
7. 前端根据 `actions` 或 `final_text` 显示结果。

这种 flow 是系统 baseline，也是更复杂 agent flow 的基础。

### 7.3 Agent Session Flow

Agent flow 在 direct task 基础上加入 session、history 和 memory：

1. 客户端调用 `POST /agent/sessions` 创建 session；
2. 客户端可调用 `PUT /memory` 写入文档摘要、写作目标、术语和偏好；
3. 用户发送消息到 `POST /agent/sessions/{id}/messages`；
4. 后端读取最近 50 条历史消息；
5. 后端读取 session memory；
6. 如果请求包含 `document_context`，先调用 context builder 得到 selection；
7. 如果这是第一条消息且标题为空，后端根据用户消息生成短标题；
8. 后端保存 user message；
9. 如果没有 subagent，则调用 `run_agent_turn`；
10. 后端保存 assistant message 和 response JSON；
11. 返回 session、user message、assistant message 和 response。

`run_agent_turn` 会把 history、memory、active skills 和 latest user message 组合成一个新的 message，再传给 `build_agent_prompt`。为了避免 prompt 过长，history 使用 `history_context_chars` 截断，只保留尾部最近内容。

### 7.4 Subagent Dispatch Flow

Subagent 有三种调度方式。

第一种是显式列表。用户或前端直接传：

```json
{
  "message": "Proofread and polish this paragraph.",
  "subagents": ["proofread", "academic_polish"]
}
```

第二种是自动规划。请求设置 `auto_subagents=true`，后端先调用 `plan_subagents`。Planner prompt 会看到已知 subagent、可用 skill、用户消息和 selected text preview，并返回最多三个 `SubAgentCall`。后端会过滤不存在的 skill，并丢弃空名称或空 instruction。

第三种是 planned subagents。前端先调用 `/subagents/plan`，让用户或 UI 有机会查看计划，再把 approved calls 作为 `planned_subagents` 发给 `/messages` 或分步 run/merge。

Subagent 执行时，后端会：

1. 根据 name 解析 `SubAgentSpec`；
2. 注入 subagent short instruction；
3. 注入 allowed action types；
4. 根据设置加载默认 skill 或用户选择的 skill；
5. 根据 context mode 组织 selected text、before/after、document metadata；
6. 附加 subagent output rules 和 response contract；
7. 调用模型并得到 `TaskResponse`；
8. 将 summary 前缀改为 subagent 名称；
9. 返回结果。

多个结果先通过规则合并：

- replies 用空行连接；
- actions 直接汇总；
- final_text 取最后一个非空值；
- summary 汇总各 subagent summary。

如果 `llm_merge_subagents=true`，合并结果会再交给主 agent prompt 进行协调，避免 proofread 和 academic polish 给出冲突改写。

### 7.5 Stepwise and Parallel Subagent Modes

Word 插件支持两种 stepwise 执行模式：

- pipeline：前一个 subagent 的 final text 或 replacement 作为后一个 subagent 的输入；
- parallel：多个 subagent 同时基于原始 document context 运行，然后统一 merge。

Pipeline 更适合“先校对，再润色”的顺序任务；parallel 更适合“分别给摘要、评论和公式建议”的独立任务。当前后端提供 `/subagents/run` 和 `/subagents/merge` 支持这种细粒度控制。

### 7.6 Formula Handling

公式任务覆盖两层逻辑。后端 prompt 可以让模型返回 `replace_selection_equation` 或 `insert_equation`，并把公式源放在 `formula` 字段，`formula_format` 通常为 `latex`。前端收到公式 action 后，将 LaTeX-like string 转为 Word OOXML，然后通过 Office.js 插入。当前前端 parser 支持基本分数、平方根、上下标、部分希腊字母和常见运算符。复杂公式仍是未来工作。

## 8. Implementation Details

### 8.1 Technology Stack

项目使用的核心技术如下：

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

项目目录结构体现了清晰的职责划分：

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
scripts/              Start, test, certificate and installer utilities
tests/                Unit tests and scenario files
examples/simple-web/  Browser demo
server.py             Unified packaged server entry point
```

### 8.3 Error Handling

系统在多个层次处理错误：

- AI 配置不完整时，`get_client` 返回 HTTP 503；
- 模型端连接失败或返回 HTTP 400+ 时，`AIClientError` 转为 HTTP 502；
- 模型输出非法 JSON 时，返回 502，避免前端误用；
- context builder 对非法 selection offset 返回 400；
- session 不存在时返回 404；
- skill 名称非法时返回 400；
- Word 插件请求失败时，在 error box 中展示错误消息。

这种错误分层使调试更清楚，也避免把模型错误伪装成前端错误。

### 8.4 Security and User Control

项目的安全策略主要体现在三点：

1. API key 不提交到 Git，真实密钥保存在本地 `.env`。
2. 所有文档修改通过 action 表达，并默认 `requires_confirmation=true`。
3. 高风险操作可以通过 `risk_level` 标注，由前端决定是否自动应用或要求审查。

当前版本是本地开发型系统，默认允许 CORS `*` 以便调试。若部署到更开放环境，需要收紧 CORS、加入身份验证，并设计更严格的文档数据保护策略。

## 9. Experiments and Evaluation

### 9.1 Evaluation Goals

由于本项目重点是软件系统和 LLM 封装框架，评估目标分为两类：

- **Engineering correctness**：API、schema、context builder、session、memory、subagent 和 Word action 数据流是否正确。
- **Writing quality**：模型真实输出是否语义保真、语法正确、学术风格合适、用户可接受。

当前项目主要完成第一类评估。第二类评估需要真实模型调用、人工评分和更多测试文本，作为未来工作。

### 9.2 Unit Tests for Subagents

`tests/test_subagents.py` 使用 mock AI client 隔离模型随机性，验证 subagent 机制。运行命令如下：

```powershell
$tmp = Join-Path (Get-Location) '.tmp\pytest'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TMP = $tmp
$env:TEMP = $tmp
pytest -q
```

结果为：

```text
11 passed, 1 warning
```

测试覆盖内容包括：

- 不指定 subagent 时走原始 agent flow；
- 单个 `proofread` subagent 注入对应 skill；
- 多个 subagent 的 actions 和 final_text 正确合并；
- 自定义 subagent 名称可以运行；
- main agent 也可以接收 selected skills；
- subagent 默认不注入完整历史，避免 prompt 过长；
- 可关闭 full skill prompt；
- auto planner 能生成 subagent call 并过滤不存在的 skill；
- 新增非预设 skill 后 planner 能看到并调用；
- stepwise run/merge endpoint 可用；
- LLM merge 使用 history context limit 截断旧历史。

这些测试证明 subagent 不是一个只停留在概念上的模块，而是具有完整执行路径和可验证行为的软件组件。

### 9.3 Fixed Agent Flow Test

`scripts/test_agent_flow.py --mock` 使用固定 methods-section 文本验证端到端 agent flow。测试步骤包括：

1. `GET /health`；
2. `POST /context/build`；
3. `POST /agent/sessions`；
4. `PUT /agent/sessions/{id}/memory`；
5. `POST /agent/sessions/{id}/messages`；
6. `GET /agent/sessions/{id}/messages`；
7. `DELETE /agent/sessions/{id}`。

测试文本为：

```text
This method is good and useful.
```

该句位于 biomedical engineering report 的 Methods 上下文中。测试结果显示，context builder 返回 before=120 chars、after=214 chars，并保留正确 selected text。Mock agent 返回中文解释、英文改写、`replace_selection` action 和 low risk 标记。该流程验证了 context、memory、agent response、message storage 和 cleanup 的完整链路。

### 9.4 Multi-Turn Scenario Test

`scripts/agent_scenario_test.py --mock` 使用 `tests/scenarios/academic_rewrite.zh-CN.json` 运行三轮对话：

1. 用户要求解释选中句子问题，并给出更正式的英文改写；
2. 用户要求基于刚才解释再给更简洁版本；
3. 用户强调不要改变 scientific meaning，再给一个版本。

结果为：

```text
Scenario test passed.
Saved messages: 2 -> 4 -> 6
```

这个测试说明 session 能持续保存多轮 user/assistant 消息，memory 和 document context 能在每轮注入 prompt，action schema 也能持续满足要求。虽然 mock 输出不能代表真实模型质量，但它验证了多轮写作系统的工程基础。

### 9.5 Ablation-Style Analysis

按照课程写作指导，我们不仅报告“系统有什么”，也分析“如果没有某个设计会怎样”。Table 3 总结了关键设计的必要性。

```text
Table 3. Design choices and expected failures without them.
```

| Design choice | If removed | Evidence in project |
|---|---|---|
| Context builder | 客户端各自拼上下文，选区重复或 offset 错误时行为不一致 | `/context/build` 和 flow test |
| `TaskResponse` schema | 前端无法可靠判断 reply、final_text 和 actions | Pydantic validation and tests |
| `requires_confirmation` | 模型可能直接覆盖文档，缺少用户控制 | action schema and taskpane apply logic |
| Session storage | 多轮请求无法读取历史，不能保存 assistant response | scenario message count |
| Session memory | 写作目标和术语偏好需要用户每轮重复说明 | memory injection tests |
| Subagents | 复合任务都挤进一个 prompt，职责不清 | 11 subagent unit tests |
| Stepwise run/merge | 前端无法检查单个 subagent 结果 | `/subagents/run` and `/merge` tests |
| Runtime config | 打包后端口变化时插件仍写死 API 地址 | `runtime-config.json` |

该分析说明最终架构不是功能堆叠，而是由 baseline 的限制逐步推导出来的。

## 10. Discussion

### 10.1 What Worked Well

项目中最成功的设计是把“模型输出”与“文档编辑动作”分离。模型负责提出建议，前端负责预览、确认和应用。这种设计比直接把 final text 写回 Word 更安全，也更符合人机协作的写作方式。

第二个有效设计是后端统一 context builder。Word、CLI 和 Web demo 都可能提供不同粒度的输入，但后端统一转换为 `TextRequest` 后，模型 prompt 的格式保持稳定。这降低了前端复杂度。

第三个有效设计是 subagent 的轻量化实现。系统没有引入复杂 agent framework，而是在现有 FastAPI 服务层中实现 registry、planner、skill injection、allowed actions 和 merge。这使 subagent 足够可控，也容易测试。

### 10.2 Limitations

当前系统仍存在明显限制。首先，真实模型质量尚未系统评估。Mock tests 验证的是工程链路，而不是改写质量。其次，Word 文档结构利用还不充分。当前主要使用 plain text、selection 和 body text，尚未充分利用 Word heading、comment、footnote、reference、table 和 equation object。第三，formula parser 只覆盖基础 LaTeX 结构。第四，section scope 尚未实现，系统会 warning 并使用当前 selection。第五，当前系统是本地开发型应用，尚未完成面向普通用户的安装、更新和安全发布流程。

### 10.3 Lessons Learned

本项目最重要的经验是：构建 LLM 应用时，prompt 只是其中一部分。真正决定系统可用性的往往是 schema、上下文、错误处理、状态管理和 UI 控制。一个强模型如果没有结构化输出，仍然难以接入 Word；一个好的 prompt 如果没有 session memory，仍然难以支持连续写作；一个能生成漂亮改写的系统如果没有 undo/review，也不适合直接修改用户文档。

## 11. Future Work

未来工作可以从五个方向推进：

1. **真实质量评估**：构建包含语法错误、学术润色、术语保真和公式转换的测试集，并邀请多人评分。
2. **更深的 Word 结构解析**：读取 heading hierarchy、table、caption、comment 和 equation object，使 context builder 更接近真实文档结构。
3. **更可靠的 action 定位**：当前 action 可以包含 anchor text 和 occurrence，但前端仍主要替换当前选区。未来可实现 range-level 定位和冲突检测。
4. **Memory 自动更新**：当前 memory 由用户显式维护。未来可让模型提出 memory update proposal，再由用户确认。
5. **部署与安全**：完善 installer、证书信任、自动更新、CORS 限制和敏感数据保护。

## 12. Conclusion

本文以 AAAI-style 系统论文形式介绍了 Word AI Assistant，一个面向 Microsoft Word 的可控 LLM 写作助手。系统围绕真实文档编辑需求，构建了从 Word Add-in 到 FastAPI 后端、从 context builder 到 model gateway、从 session storage 到 subagent dispatch 的完整框架。相比简单的 prompt baseline，最终系统能够读取文档上下文、维护多轮记忆、拆解复合任务、返回结构化 action，并在 Word 中预览、应用和撤销修改。

实验表明，当前系统的关键工程路径已经通过自动化测试验证：subagent 单元测试 11 项通过，固定 agent flow 和三轮 scenario mock 均通过。虽然真实模型质量评估仍需进一步完善，但本项目已经展示了把通用 LLM 封装为文档写作工具所需的核心软件设计。该系统的价值不只在于“能调用模型”，而在于提供了一套可控、可扩展、可验证的写作辅助框架。

## References

[1] `README.md`，Word AI Backend 项目说明。  
[2] `server.py`，统一启动 FastAPI 后端与 Word Add-in HTTPS 静态服务。  
[3] `app/main.py`，FastAPI HTTP API、agent session 和 skill 管理接口。  
[4] `app/services.py`，任务执行、agent turn、subagent 调度与结果合并逻辑。  
[5] `app/ai_client.py`，OpenAI-compatible SDK 与 direct endpoint 模型调用封装。  
[6] `app/context_builder.py`，文档上下文构建与选区解析。  
[7] `app/models.py`，`TextRequest`、`TaskResponse`、`TextAction` 和 agent 数据模型。  
[8] `app/storage.py`，SQLite 会话、消息和 memory 持久化。  
[9] `app/subagents.py`，subagent registry 与 skill 文件映射。  
[10] `app/prompts.py` 与 `prompts/*.md`，prompt 加载、格式化与 response contract。  
[11] `skills/*.md`，可扩展 skill 指令文件。  
[12] `word-addin/manifest.xml`，Office Add-in manifest 与 Ribbon 配置。  
[13] `word-addin/taskpane.js`，Word task pane、agent 对话、action 应用和 undo/review。  
[14] `word-addin/settings.js` 与 `word-addin/shared.js`，设置页、runtime config 和本地状态。  
[15] `tests/test_subagents.py`，subagent 自动化测试。  
[16] `scripts/test_agent_flow.py` 与 `scripts/agent_scenario_test.py`，固定流程与多轮场景测试。  
[17] `Project Writing Guidelines.docx`，课程 Project 写作规范与行文逻辑参考。

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
  "message": "请解释选中句子的问题，并给出一个更正式的英文改写。",
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

一次典型 Word 中的 agent 编辑请求如下：

1. 用户在 Word 中选中一句话。
2. 用户打开 Word AI 的 Agent task pane。
3. 前端通过 Office.js 读取 selection 和 body text。
4. 前端创建或复用后端 session。
5. 前端把设置页中的 memory 写入 session。
6. 前端发送 message 和 document_context。
7. 后端调用 context builder 生成 `TextRequest`。
8. 后端读取 history 和 memory。
9. 若启用 auto subagents，后端先规划 subagent。
10. 后端运行主 agent 或多个 subagent。
11. 后端合并结果并保存 assistant message。
12. 前端渲染 reply、summary、final_text 和 actions。
13. 用户预览 action。
14. 用户点击 Apply 或系统按设置自动应用。
15. 前端保存 lastApplied。
16. 用户可点击 Undo 恢复原文，或点击 Review 查看 before/after。
