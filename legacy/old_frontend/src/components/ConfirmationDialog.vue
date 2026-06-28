<template>
    <n-modal v-model:show="appStore.showConfirmationDialog" preset="dialog" :title="appStore.confirmationDetails.title"
        :content="appStore.confirmationDetails.content" positive-text="Confirm" negative-text="Cancel"
        @positive-click="handleConfirm" @negative-click="handleCancel" :closable="false" :mask-closable="false" />
</template>

<script setup>
import { NModal } from 'naive-ui';
import { useAppStore } from '@/store/appStore';

const appStore = useAppStore();

const handleConfirm = () => {
    if (typeof appStore.confirmationDetails.onConfirm === 'function') {
        appStore.confirmationDetails.onConfirm();
    }
    appStore.closeConfirmation();
};

const handleCancel = () => {
    appStore.closeConfirmation();
};
</script>