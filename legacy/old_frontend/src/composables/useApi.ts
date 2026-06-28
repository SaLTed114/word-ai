// src/composables/useApi.ts
import { useAppStore } from '@/store/appStore';
import type {
    AIConfigPayload,
    CorrectionResponse,
    StyleAdjustmentRequestData,
    StyleAdjustmentResponse,
    SyntaxCheckRequestData,
    UpdateConfigResponse,
    WordCheckRequestData
} from '@/types/models'; // Import the TypeScript types

const API_BASE_URL: string = 'https://localhost:8000';

// Define the structure expected by the updateConfig function
interface ConfigUpdateParams {
    apiKey: string;
    model: string;
    baseUrl: string;
}

// Update the return type definition
interface UseApiReturn {
    updateConfig: (config: ConfigUpdateParams) => Promise<boolean>; // Use the param type
    checkSyntax: (text: string) => Promise<CorrectionResponse | null>;
    checkWord: (text: string) => Promise<CorrectionResponse | null>;
    adjustStyle: (text: string, target_style: string) => Promise<StyleAdjustmentResponse | null>;
}

export function useApi(): UseApiReturn {
    const appStore = useAppStore();

    // Generic API call function with type parameter for the expected response
    const callApi = async <TResponse>(
        endpoint: string,
        options: RequestInit = {} // Use standard RequestInit type
    ): Promise<TResponse | null> => {
        appStore.setLoading(true);
        appStore.clearError();
        let response: Response;

        try {
            response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST', // Default to POST
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                body: options.body ? JSON.stringify(options.body) : null,
            });

            if (!response.ok) {
                let errorData: any = { message: `HTTP error! status: ${response.status}` };
                try {
                    const jsonError = await response.json();
                    const detail = jsonError?.detail || jsonError?.message;
                    if (typeof detail === 'string') {
                        errorData.message = detail;
                    } else if (Array.isArray(detail) && detail[0]?.msg) {
                        errorData.message = detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join('; ');
                    }
                } catch (e) {
                    errorData.message = response.statusText || errorData.message;
                }
                throw new Error(errorData.message);
            }

            if (response.status === 204 || response.headers.get("content-length") === "0") {
                return null; // Or handle as appropriate for TResponse
            }

            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                return await response.json() as TResponse;
            } else {
                throw new Error(`Expected JSON response but received ${contentType}`);
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown API error occurred';
            appStore.setError('API Request Failed', errorMessage);
            console.error("API Error:", error);
            return null;
        } finally {
            appStore.setLoading(false);
        }
    };

    const updateConfig = async (config: ConfigUpdateParams): Promise<boolean> => {
        // Prepare the body according to AIConfigPayload, matching backend AIConfig dataclass
        const body: AIConfigPayload = {
            api_key: config.apiKey,
            model: config.model,       // Send the model
            base_url: config.baseUrl,  // Send the base URL
            // Add other defaults if needed, though backend dataclass should handle them
            // temperature: 0.7,
            // max_tokens: 1000, // etc.
        };

        const response = await callApi<UpdateConfigResponse>('/config/ai', {
            method: 'POST', // Explicitly POST
            body: body as any      // Send the full config object
        });

        // Check if the API call itself was successful and returned a response object
        if (response && response.message) {
            console.log("Config Update Response:", response.message);
            // Optional: Use response.new_config_info if needed for frontend state
            return true; // Indicate success
        }

        // If callApi returned null (due to network error, non-2xx status, etc.), indicate failure
        return false;
    };


    const checkSyntax = async (text: string): Promise<CorrectionResponse | null> => {
        const body: SyntaxCheckRequestData = { text };
        return await callApi<CorrectionResponse>('/syntax', { body: body as any });
    };

    const checkWord = async (text: string): Promise<CorrectionResponse | null> => {
        const body: WordCheckRequestData = { text };
        return await callApi<CorrectionResponse>('/word', { body: body as any });
    };

    const adjustStyle = async (text: string, target_style: string): Promise<StyleAdjustmentResponse | null> => {
        const body: StyleAdjustmentRequestData = { text, target_style };
        return await callApi<StyleAdjustmentResponse>('/style', { body: body as any });
    };

    return {
        updateConfig,
        checkSyntax,
        checkWord,
        adjustStyle,
    };
}