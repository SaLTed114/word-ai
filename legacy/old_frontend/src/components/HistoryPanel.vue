<template>
    <n-card title="Operation History" size="small">
        <n-scrollbar style="max-height: 300px"> <!-- Limit height and add scroll -->
            <n-list v-if="appStore.history.length > 0" hoverable clickable bordered>
                <template #header>Recent operations (latest first)</template>
                <n-list-item v-for="item in appStore.history" :key="item.id">
                    <n-thing>
                        <template #header>
                            <n-tag :type="getTagType(item.type)" size="small" style="margin-right: 5px;">
                                {{ item.type.toUpperCase() }}
                            </n-tag>
                            {{ formatTimestamp(item.timestamp) }}
                        </template>
                        <template #description>
                            Original Snippet: "{{ item.original }}"
                        </template>
                        <!-- You could add more details here, like showing the result onClick -->
                    </n-thing>
                </n-list-item>
            </n-list>
            <n-empty v-else description="No operations recorded yet." />
        </n-scrollbar>
    </n-card>
</template>

<script setup>
import { NCard, NList, NListItem, NThing, NTag, NEmpty, NScrollbar } from 'naive-ui';
import { useAppStore } from '@/store/appStore';

const appStore = useAppStore();

function formatTimestamp(date) {
    return date.toLocaleString();
}

function getTagType(type) {
    if (type.includes('syntax')) return 'info';
    if (type.includes('word')) return 'warning';
    if (type.includes('style')) return 'success';
    if (type.includes('applied')) return 'error'; // Or choose another color for applied actions
    return 'default';
}
</script>

<style scoped>
.n-card {
    margin-bottom: 15px;
}
</style>