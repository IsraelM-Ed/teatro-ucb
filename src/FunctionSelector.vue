<script setup>
import { ref, watch } from 'vue';
import { selectFunction } from './reservation-store.js';
import { useCatalogoObras } from './useCatalogoObras.js';

const { works, selectedWorkId, catalogReady, functionGroups, dateLabel } = useCatalogoObras();
const selectedId = ref('');

watch(selectedWorkId, id => {
    const selectedWork = works.value.find(work => String(work.id) === id);
    const firstFunction = selectedWork?.funciones[0];
    selectedId.value = firstFunction?.id ?? '';
    if (!firstFunction) selectFunction(null);
});

watch(selectedId, id => {
    if (!id) {
        selectFunction(null);
        return;
    }
    const funcion = works.value
        .filter(work => String(work.id) === selectedWorkId.value)
        .flatMap(work => work.funciones)
        .find(item => item.id === id);
    if (funcion) {
        const obra = works.value.find(work => String(work.id) === selectedWorkId.value);
        document.dispatchEvent(new CustomEvent('funcion-seleccionada', {
            detail: { funcion, obra }
        }));
        selectFunction(funcion);
    }
});
</script>

<template>
    <div v-if="!catalogReady" class="selector-skeleton" role="status" aria-label="Cargando funciones">
        <span class="skeleton selector-skeleton-label"></span>
        <span class="skeleton selector-skeleton-control"></span>
    </div>
    <template v-else>
        <label for="funcion">Función</label>
        <select id="funcion" v-model="selectedId" :disabled="!functionGroups.length">
            <optgroup v-for="work in functionGroups" :key="work.id" :label="work.titulo">
                <option v-for="funcion in work.funciones" :key="funcion.id" :value="funcion.id">
                    {{ dateLabel(funcion.fecha) }}
                </option>
            </optgroup>
        </select>
    </template>
</template>
