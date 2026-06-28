// src/store/appStore.ts
import type { ActiveConfigInfo, AppError, ConfirmationDetails, HistoryData, HistoryEntry, HistoryType } from '@/types/models'; // Import ActiveConfigInfo
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

interface ConfirmationState extends Partial<ConfirmationDetails> {
    onConfirm?: () => void | Promise<void>;
}

export const useAppStore = defineStore('app', () => {
    // State
    const isLoading = ref<boolean>(false);
    const globalError = ref<AppError | null>(null);
    const history = ref<HistoryEntry[]>([]);
    const showConfirmationDialog = ref<boolean>(false);
    const confirmationDetails = ref<ConfirmationState>({
        title: '',
        content: '',
        onConfirm: () => { },
    });
    // Store active config details
    const activeConfig = ref<ActiveConfigInfo>({
        apiKeySuffix: null,
        model: null,
        baseUrl: null,
    });


    // Getters (Computed)
    const isClientConfigured = computed<boolean>(() =>
        !!activeConfig.value.apiKeySuffix &&
        !!activeConfig.value.model &&
        !!activeConfig.value.baseUrl
    );

    // Actions
    function setLoading(loadingState: boolean): void {
        isLoading.value = loadingState;
    }

    function setError(message: string, details: string = ''): void {
        console.error("Error:", message, details);
        globalError.value = { message, details };
    }

    function clearError(): void {
        globalError.value = null;
    }

    function addHistoryEntry(
        type: HistoryType,
        original: string,
        result: HistoryData
    ): void {
        // Ensure result is serializable if needed, ActiveConfigInfo is fine
        history.value.unshift({
            id: Date.now(),
            type,
            original: original.substring(0, 100) + (original.length > 100 ? '...' : ''),
            result: result,
            timestamp: new Date(),
        });
        if (history.value.length > 50) {
            history.value.pop();
        }
    }

    // Action to set the active configuration details
    function setActiveConfig(key: string, model: string, baseUrl: string): void {
        if (!key || !model || !baseUrl) { // Basic guard
            activeConfig.value = { apiKeySuffix: null, model: null, baseUrl: null };
            console.warn("Attempted to set incomplete active config.");
            return;
        }
        const newConfig: ActiveConfigInfo = {
            apiKeySuffix: `...${key.slice(-4)}`,
            model: model,
            baseUrl: baseUrl,
        }
        activeConfig.value = newConfig;
        // Add more descriptive history entry
        addHistoryEntry('config-update', 'Client Configured', `Model: ${model}, Key: ${newConfig.apiKeySuffix}, BaseURL: ${baseUrl}`);
    }

    // Action to clear configuration, e.g., on explicit logout or error
    function clearActiveConfig(): void {
        activeConfig.value = { apiKeySuffix: null, model: null, baseUrl: null };
        // Optionally add history entry for config clear
    }


    function openConfirmation(details: ConfirmationDetails): void {
        confirmationDetails.value = { ...details };
        showConfirmationDialog.value = true;
    }

    function closeConfirmation(): void {
        showConfirmationDialog.value = false;
        confirmationDetails.value = { title: '', content: '', onConfirm: () => { } };
    }

    return {
        // State refs
        isLoading,
        globalError,
        history,
        showConfirmationDialog,
        confirmationDetails,
        activeConfig, // Expose the active config object

        // Computed refs (Getters)
        isClientConfigured, // Use this to gate functionality

        // Actions
        setLoading,
        setError,
        clearError,
        addHistoryEntry,
        setActiveConfig, // Action to update the config state
        clearActiveConfig, // Action to clear config
        openConfirmation,
        closeConfirmation,
    };
});