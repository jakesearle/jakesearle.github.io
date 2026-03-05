<script setup>
function print() {
    if (typeof window !== 'undefined') {
        window.print()
    }
}
</script>

<template>
    <button class="print-btn" @click="print">Print / Save as PDF</button>
</template>

<style scoped>
.print-btn {
    background-color: var(--vp-button-brand-bg);
    color: var(--vp-button-brand-text);
    border-radius: 8px;
    padding: 6px 16px;
    border: none;
    cursor: pointer;
    margin-top: 16px;
}

@media print {
    .print-btn {
        display: none;
    }
}
</style>