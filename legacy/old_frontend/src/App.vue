<template>
    <n-config-provider :theme-overrides="themeOverrides">
        <n-message-provider>
            <n-dialog-provider> <!-- Needed for Confirmation Dialog if used via useDialog -->
                <n-layout style="padding: 15px;">
                    <n-layout-content>
                        <n-spin :show="appStore.isLoading">
                            <template #description>Processing...</template>
                            <n-space vertical>
                                <n-alert v-if="appStore.globalError" type="error" closable @close="appStore.clearError">
                                    <template #header>{{ appStore.globalError.message }}</template>
                                    {{ appStore.globalError.details }}
                                </n-alert>

                                <api-key-config />

                                <n-tabs type="line" animated default-value="syntax">
                                    <n-tab-pane name="syntax" tab="Syntax">
                                        <correction-panel check-type="syntax" />
                                    </n-tab-pane>
                                    <n-tab-pane name="word" tab="Word Choice">
                                        <correction-panel check-type="word" />
                                    </n-tab-pane>
                                    <n-tab-pane name="style" tab="Style">
                                        <style-adjustment-panel />
                                    </n-tab-pane>
                                    <n-tab-pane name="history" tab="History">
                                        <history-panel />
                                    </n-tab-pane>
                                </n-tabs>

                            </n-space>
                        </n-spin>

                        <!-- Confirmation Dialog managed by appStore -->
                        <confirmation-dialog />

                    </n-layout-content>
                </n-layout>
            </n-dialog-provider>
        </n-message-provider>
    </n-config-provider>
</template>

<script setup>
import {
    NConfigProvider, NMessageProvider, NDialogProvider, NLayout, NLayoutContent,
    NSpace, NSpin, NAlert, NTabs, NTabPane
} from 'naive-ui';
import ApiKeyConfig from './components/ApiKeyConfig.vue';
import CorrectionPanel from './components/CorrectionPanel.vue';
import StyleAdjustmentPanel from './components/StyleAdjustmentPanel.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue'; // Import the dialog

import { useAppStore } from '@/store/appStore';

const appStore = useAppStore();

// Optional: Customize Naive UI theme
const themeOverrides = {
    common: {
        // primaryColor: '#...',
        // primaryColorHover: '#...',
    }
};

</script>

<style>
/* Global styles if needed */
body {
    display: flex;
    flex-direction: column;
}
</style>