<template>
    <n-card title="AI Client Configuration" size="small">
        <n-spin :show="appStore.isLoading">
            <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
                <n-grid :cols="1" :y-gap="12">
                    <n-form-item-gi label="OpenAI API Key" path="apiKey" required>
                        <n-input v-model:value="formValue.apiKey" type="password" show-password-on="click"
                            placeholder="Enter API Key" :disabled="appStore.isLoading" />
                    </n-form-item-gi>

                    <n-form-item-gi label="Model Name" path="model">
                        <n-input v-model:value="formValue.model" placeholder="e.g., gpt-3.5-turbo, gpt-4"
                            :disabled="appStore.isLoading" />
                    </n-form-item-gi>

                    <n-form-item-gi label="API Base URL" path="baseUrl">
                        <n-input v-model:value="formValue.baseUrl" placeholder="e.g., https://api.openai.com/v1"
                            :disabled="appStore.isLoading" />
                        <template #help>Usually ends with /v1</template>
                    </n-form-item-gi>

                    <n-gi>
                        <n-button type="primary" @click="handleUpdateConfig" :loading="appStore.isLoading"
                            :disabled="appStore.isLoading" block>
                            {{ appStore.isClientConfigured ? 'Update Configuration' : 'Set Configuration' }}
                        </n-button>
                    </n-gi>

                </n-grid>
            </n-form>

            <!-- Display Active Configuration -->
            <n-divider v-if="appStore.isClientConfigured" title-placement="left"
                style="margin-top: 20px; margin-bottom: 10px;">
                Active Configuration
            </n-divider>
            <n-descriptions v-if="appStore.isClientConfigured" label-placement="top" bordered size="small" :column="1">
                <n-descriptions-item label="API Key">{{ appStore.activeConfig.apiKeySuffix }}</n-descriptions-item>
                <n-descriptions-item label="Model">{{ appStore.activeConfig.model }}</n-descriptions-item>
                <n-descriptions-item label="Base URL">{{ appStore.activeConfig.baseUrl }}</n-descriptions-item>
            </n-descriptions>
            <n-text v-else depth="3" style="margin-top: 15px; display: block;">
                Please provide the configuration details to enable AI features.
            </n-text>

        </n-spin>
    </n-card>
</template>

<script setup lang="ts">
import { useApi } from '@/composables/useApi';
import { useAppStore } from '@/store/appStore';
import {
    NButton,
    NCard,
    NDescriptions, NDescriptionsItem,
    NDivider,
    NForm,
    NFormItemGi,
    NGi,
    NGrid,
    NInput,
    NSpin,
    NText,
    useMessage,
    type FormInst,
    type FormItemRule,
    type FormRules
} from 'naive-ui';
import { reactive, ref } from 'vue';

// Define interface for form values
interface FormValue {
    apiKey: string;
    model: string;
    baseUrl: string;
}

const appStore = useAppStore();
const { updateConfig } = useApi();
const message = useMessage();
const formRef = ref<FormInst | null>(null);

// Reactive form model with defaults matching backend/common values
const formValue = reactive<FormValue>({
    // Avoid storing the actual key here long-term if possible,
    // maybe load from a secure store if the Add-in framework provides one,
    // otherwise, user needs to enter it each session.
    apiKey: 'AIzaSyDEQ5VDR9quX9BwgjsEnPb92MmsIC1YYuA',
    model: 'gemini-2.5-flash-preview-04-17', // Default model
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', // Default base URL (AIClient expects this base)
});

// Basic validation rules
const rules: FormRules = {
    apiKey: [
        {
            required: true,
            message: 'API Key is required',
            trigger: ['input', 'blur'],
        }
    ],
    model: {
        required: true,
        message: 'Model name is required',
        trigger: ['input', 'blur'],
    },
    baseUrl: [
        {
            required: true,
            message: 'Base URL is required',
            trigger: ['input', 'blur']
        },
        {
            validator: (rule: FormItemRule, value: string) => {
                try {
                    new URL(value); // Basic URL format check
                    return true;
                } catch (_) {
                    return new Error('Please enter a valid URL');
                }
            },
            trigger: ['input', 'blur']
        },
        { // Add specific check for the chat completions endpoint if needed
            validator: (rule: FormItemRule, value: string) => {
                if (value && value.endsWith('/chat/completions')) {
                    return new Error('Base URL should usually not include "/chat/completions"');
                }
                return true;
            },
            trigger: ['input', 'blur']
        }
    ]
};


async function handleUpdateConfig(): Promise<void> {
    try {
        await formRef.value?.validate(); // Validate the form first
        // Validation passed
        appStore.clearError(); // Clear previous errors

        // Prepare data for the API call
        const configData = {
            apiKey: formValue.apiKey,
            model: formValue.model,
            baseUrl: formValue.baseUrl,
        };

        const success = await updateConfig(configData); // Call API

        if (success) {
            // Update the store with the successfully set configuration
            appStore.setActiveConfig(formValue.apiKey, formValue.model, formValue.baseUrl);
            message.success('AI configuration updated successfully.');
            // Optionally clear the API key field after successful update for security
            // formValue.apiKey = '';
        } else {
            // Error message is handled globally by useApi/appStore, but show a generic failure message here too.
            message.error('Failed to update AI configuration. Check error message above or console.');
            // Do NOT clear the form on failure, let user correct it.
            // Maybe clear the sensitive stored config on failure?
            // appStore.clearActiveConfig();
        }

    } catch (errors) {
        // Validation failed
        message.warning('Please check the configuration details.');
        console.log("Form validation errors:", errors);
    }
}

</script>

<style scoped>
.n-card {
    margin-bottom: 15px;
}
</style>