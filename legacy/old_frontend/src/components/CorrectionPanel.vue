<template>
    <n-card :title="panelTitle" size="small">
        <n-space vertical>
            <n-text depth="3">{{ description }}</n-text>
            <n-button type="primary" @click="handleCheck" :loading="appStore.isLoading"
                :disabled="!appStore.isClientConfigured || appStore.isLoading">
                {{ buttonText }}
            </n-button>

            <n-collapse-transition :show="!!correctionResult && correctionResult.corrections?.length > 0">
                <n-divider title-placement="left">Suggestions</n-divider>
                <n-alert v-if="correctionResult?.message" type="success" :title="correctionResult.message" closable />
                <n-list hoverable clickable bordered>
                    <template #header>
                        Found {{ correctionResult?.corrections?.length }} potential issue(s). Select suggestions to apply.
                    </template>
                    <n-list-item v-for="(item, index) in correctionResult?.corrections" :key="index">
                        <template #prefix>
                             <n-checkbox
                                :checked="selectedCorrectionIndices.has(index)"
                                @update:checked="toggleSelection(index)"
                                style="margin-right: 10px;"
                             />
                        </template>
                        <n-thing>
                            <template #header>Issue {{ index + 1 }}</template>
                            <template #description>
                                <n-text type="error">Original:</n-text> {{ item.original }} <br />
                                <n-text type="success">Suggestion:</n-text> {{ item.corrected }}
                            </template>
                            <n-text depth="3">Reason: {{ item.reason }}</n-text>
                        </n-thing>
                    </n-list-item>
                </n-list>
                <!-- Apply Selected Suggestions Button -->
                <n-button v-if="correctionResult?.corrections?.length > 0 && currentSelection" type="warning"
                    @click="confirmApplySelectedCorrections" :loading="appStore.isLoading"
                    :disabled="selectedCorrectionIndices.size === 0 || appStore.isLoading"
                    style="margin-top: 10px;">
                    Apply Selected Suggestions ({{ selectedCorrectionIndices.size }})
                </n-button>
            </n-collapse-transition>
            <n-empty v-if="showNoIssuesMessage" description="No issues found in the selected text."
                style="margin-top: 15px;" />

        </n-space>
    </n-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
    NCard, NButton, NSpace, NText, NList, NListItem, NThing,
    NCollapseTransition, NDivider, NAlert, NEmpty, useMessage, NCheckbox // Import NCheckbox
} from 'naive-ui';
import { useAppStore } from '@/store/appStore';
import { useOffice } from '@/composables/useOffice';
import { useApi } from '@/composables/useApi';

const props = defineProps({
    checkType: {
        type: String,
        required: true, // 'syntax' or 'word'
    },
});

const appStore = useAppStore();
const { getSelectedText, setSelectedText } = useOffice();
const { checkSyntax, checkWord } = useApi();
const message = useMessage();

const correctionResult = ref(null); // Stores the API response CorrectionResponse
const currentSelection = ref('');
const triedChecking = ref(false); // To know if a check was attempted
const selectedCorrectionIndices = ref(new Set()); // Track selected indices

const panelTitle = computed(() => props.checkType === 'syntax' ? 'Syntax Check' : 'Word Choice Check');
const description = computed(() => props.checkType === 'syntax'
    ? 'Check the selected text for grammatical errors.'
    : 'Check the selected text for awkward phrasing or word choice issues.');
const buttonText = computed(() => props.checkType === 'syntax' ? 'Check Syntax' : 'Check Word Choice');
const showNoIssuesMessage = computed(() => {
    // Show if a check was tried, not loading, no errors, and no corrections found
    return triedChecking.value &&
        !appStore.isLoading &&
        !appStore.globalError &&
        (!correctionResult.value || correctionResult.value?.corrections?.length === 0);
});

// Clear results and selection when API key changes or error occurs
watch(() => appStore.apiKey, () => {
    correctionResult.value = null;
    currentSelection.value = '';
    triedChecking.value = false;
    selectedCorrectionIndices.value.clear();
});
watch(() => appStore.globalError, (newError) => {
    if (newError) {
        correctionResult.value = null; // Clear results on new error
        currentSelection.value = '';
        triedChecking.value = false;
        selectedCorrectionIndices.value.clear();
    }
});

// Function to toggle selection state for a correction
function toggleSelection(index) {
    if (selectedCorrectionIndices.value.has(index)) {
        selectedCorrectionIndices.value.delete(index);
    } else {
        selectedCorrectionIndices.value.add(index);
    }
}

async function handleCheck() {
    appStore.clearError();
    correctionResult.value = null; // Clear previous results
    currentSelection.value = '';
    triedChecking.value = false;
    selectedCorrectionIndices.value.clear(); // Clear selection on new check

    const selectedText = await getSelectedText();
    if (!selectedText) {
        // Error handled in getSelectedText or no text selected message shown
        message.warning('Please select text in the document first.');
        return;
    }
    currentSelection.value = selectedText; // Store for applying correction later

    let result = null;
    if (props.checkType === 'syntax') {
        result = await checkSyntax(selectedText);
    } else {
        result = await checkWord(selectedText);
    }
    console.log(result); // Debugging output
    triedChecking.value = true; // Mark that a check was attempted

    if (result) {
        correctionResult.value = result;
        if (!result.corrections || result.corrections.length === 0) {
            // message.info('No corrections needed for the selected text.'); // Can use NEmpty instead
        } else {
            appStore.addHistoryEntry(props.checkType, selectedText, result);
        }
    } else {
        // Error is handled globally, but reset local state if needed
        correctionResult.value = null;
    }
}

// Calculates the text after applying selected corrections
function calculateAppliedText() {
    if (!correctionResult.value?.corrections || selectedCorrectionIndices.value.size === 0) {
        return currentSelection.value; // Return original if no selections
    }

    let textToModify = currentSelection.value;
    const sortedIndices = Array.from(selectedCorrectionIndices.value).sort((a, b) => a - b);

    // Apply corrections sequentially based on the sorted index order
    sortedIndices.forEach(index => {
        const correction = correctionResult.value.corrections[index];
        if (correction) {
            textToModify = textToModify.replace(correction.original, correction.corrected);
        }
    });

    return textToModify;
}

function confirmApplySelectedCorrections() {
    if (selectedCorrectionIndices.value.size === 0 || !currentSelection.value) return;

    const previewText = calculateAppliedText();

    appStore.openConfirmation({
        title: `Confirm ${panelTitle.value} Application`,
        content: `This will replace the selected text with the version incorporating ${selectedCorrectionIndices.value.size} selected suggestion(s).`,
        originalText: currentSelection.value, // Show original for comparison
        newText: previewText, // Show the calculated result
        onConfirm: applySelectedCorrections, // Use the new apply function
    });
}

async function applySelectedCorrections() {
    appStore.setLoading(true); // Show loading on the dialog confirmation

    const finalText = calculateAppliedText(); // Recalculate to be sure
    const success = await setSelectedText(finalText);
    appStore.setLoading(false);

    if (success) {
        message.success('Text updated in the document.');
        // Log the applied changes
        const appliedCorrections = Array.from(selectedCorrectionIndices.value).map(
            index => correctionResult.value.corrections[index]
        );
        appStore.addHistoryEntry(`${props.checkType}-applied`, currentSelection.value, { appliedText: finalText, changes: appliedCorrections });

        // Reset state after successful application
        correctionResult.value = null;
        currentSelection.value = '';
        triedChecking.value = false;
        selectedCorrectionIndices.value.clear();
    } else {
        message.error('Failed to update the document.');
        // Error message also shown globally by setSelectedText
    }
}

</script>

<style scoped>
.n-card {
    margin-bottom: 15px;
}
/* Optional: Style list items slightly differently when selected */
/* .n-list-item.selected { background-color: #f0f8ff; } */
</style>