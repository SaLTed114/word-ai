// src/types/models.ts

// --- Backend Request/Response Models ---

export interface CorrectionItem {
    original: string;
    corrected: string;
    reason: string;
}

export interface CorrectionResponse {
    corrections: CorrectionItem[];
    message: string; // Optional in the request, present in response
}

export interface StyleAdjustmentResponse {
    result: string;
    reasons: string[];
}

// Used for API call bodies (match Python dataclasses)
export interface SyntaxCheckRequestData {
    text: string;
}

export interface WordCheckRequestData {
    text: string;
}

export interface StyleAdjustmentRequestData {
    text: string;
    target_style: string; // Match Python naming convention
}

export interface AIConfigPayload {
    api_key: string;
    model?: string; // Optional if defaults are acceptable on backend
    base_url?: string; // Optional if defaults are acceptable on backend
    // Add other AIConfig fields if needed/sent from frontend
}

// Describes the relevant active config details stored in the frontend store
export interface ActiveConfigInfo {
    apiKeySuffix: string | null;
    model: string | null;
    baseUrl: string | null;
}

export interface UpdateConfigResponse {
    message: string;
    // Include the structure from backend's get_current_config_info if you want to use it
    new_config_info?: {
        current_api_key_suffix: string | null;
        config_version: number;
        client_instance_id: number | null;
    };
}


// --- Frontend Specific Models ---

export type HistoryType = 'syntax' | 'word' | 'style' | 'syntax-applied' | 'word-applied' | 'style-applied' | 'config-update'; // More specific type

export type HistoryData = CorrectionResponse | StyleAdjustmentResponse | string | ActiveConfigInfo | null | undefined; // Generalized type for history entry result

export interface HistoryEntry {
    id: number;
    type: HistoryType;
    original: string; // Can be snippet or full text depending on context
    result: HistoryData; // Store API result or simple message
    timestamp: Date;
}

export interface ConfirmationDetails {
    title: string;
    content: string;
    originalText?: string; // Optional, may not apply to all confirmations
    newText?: string;      // Optional
    onConfirm: () => void | Promise<void>;
}

// For the global error state
export interface AppError {
    message: string;
    details?: string;
}