<template>
    <n-card title="Style Adjustment" size="small">
        <n-space vertical>
            <n-text depth="3">Adjust the selected text to a different style (e.g., formal, casual, concise).</n-text>
            <n-input v-model:value="targetStyle" placeholder="Enter target style (e.g., formal)"
                :disabled="appStore.isLoading || !appStore.isClientConfigured" />
            <n-button type="primary" @click="handleAdjustStyle" :loading="appStore.isLoading"
                :disabled="!appStore.isClientConfigured || appStore.isLoading || !targetStyle">
                Adjust Style
            </n-button>

            <n-collapse-transition :show="!!styleResult">
                <n-divider title-placement="left">Adjustment Result</n-divider>
                <n-card size="small" embedded title="Adjusted Text">
                    <n-code :code="styleResult?.result || 'No result yet.'" language="text" word-wrap />
                </n-card>
                <n-card size="small" embedded title="Reasons for Changes" style="margin-top: 10px;">
                    <n-list v-if="styleResult?.reasons?.length > 0">
                        <n-list-item v-for="(reason, index) in styleResult.reasons" :key="index">
                            {{ reason }}
                        </n-list-item>
                    </n-list>
                    <n-text v-else depth="3">No specific reasons provided.</n-text>
                </n-card>
                <n-button v-if="styleResult?.result && currentSelection" type="warning" @click="confirmApplyStyle"
                    :loading="appStore.isLoading" style="margin-top: 10px;">
                    Apply Adjusted Style
                </n-button>
            </n-collapse-transition>

        </n-space>
    </n-card>
</template>

<script setup>
import { ref, watch } from 'vue';
import {
    NCard, NButton, NSpace, NText, NInput, NList, NListItem, NCode,
    NCollapseTransition, NDivider, useMessage
} from 'naive-ui';
import { useAppStore } from '@/store/appStore';
import { useOffice } from '@/composables/useOffice';
import { useApi } from '@/composables/useApi';

const appStore = useAppStore();
const { getSelectedText, setSelectedText } = useOffice();
const { adjustStyle } = useApi();
const message = useMessage();

const targetStyle = ref('');
const styleResult = ref(null); // Stores the StyleAdjustmentResponse
const currentSelection = ref('');


// Clear results when API key changes or error occurs
watch(() => appStore.apiKey, () => {
    styleResult.value = null;
    currentSelection.value = '';
});
watch(() => appStore.globalError, (newError) => {
    if (newError) {
        styleResult.value = null; // Clear results on new error
        currentSelection.value = '';
    }
});


async function handleAdjustStyle() {
    appStore.clearError();
    styleResult.value = null; // Clear previous results
    currentSelection.value = '';

    if (!targetStyle.value.trim()) {
        message.error('Please enter a target style.');
        return;
    }

    const selectedText = await getSelectedText();
    if (!selectedText) {
        return;
    }
    currentSelection.value = selectedText; // Store for applying later

    const result = await adjustStyle(selectedText, targetStyle.value);

    if (result) {
        styleResult.value = result;
        appStore.addHistoryEntry('style', selectedText, result);
    } else {
        styleResult.value = null;
    }
}

function confirmApplyStyle() {
    if (!styleResult.value?.result || !currentSelection.value) return;

    appStore.openConfirmation({
        title: 'Confirm Style Application',
        content: `This will replace the selected text with the adjusted version.`,
        originalText: currentSelection.value,
        newText: styleResult.value.result,
        onConfirm: applyStyle,
    });
}

async function applyStyle() {
    appStore.setLoading(true);
    const success = await setSelectedText(styleResult.value.result);
    appStore.setLoading(false);

    if (success) {
        message.success('Text updated in the document.');
        appStore.addHistoryEntry('style-applied', currentSelection.value, styleResult.value.result);
        styleResult.value = null; // Clear results after applying
        currentSelection.value = '';
        targetStyle.value = ''; // Clear style input
    } else {
        message.error('Failed to update the document.');
    }
}
</script>

<style scoped>
.n-card {
    margin-bottom: 15px;
}
</style>