import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useCatalogoObras() {
    const works = ref([]);
    const selectedWorkId = ref('');
    const catalogReady = ref(false);

    const dateLabel = date => dayjs(date).format('ddd D MMM YYYY, HH:mm');
    const functionGroups = computed(() => works.value
        .filter(work => String(work.id) === selectedWorkId.value)
        .map(work => ({
            ...work,
            funciones: work.funciones.map(funcion => ({
                ...funcion,
                label: `${work.titulo} - ${dateLabel(funcion.fecha)}`
            }))
        })));

    function loadWorks() {
        if (!window.TEATRO) return;
        works.value = window.TEATRO.obras ?? [];
        catalogReady.value = true;
        const requestedId = new URLSearchParams(window.location.search).get('obra');
        const selectedWork = works.value.find(work => String(work.id) === requestedId) ?? works.value[0];
        selectedWorkId.value = selectedWork ? String(selectedWork.id) : '';
    }

    function updateSelectedWork(event) {
        const selectedWork = works.value.find(work => String(work.id) === String(event.detail?.id));
        if (selectedWork) selectedWorkId.value = String(selectedWork.id);
    }

    onMounted(() => {
        loadWorks();
        document.addEventListener('datos-listos', loadWorks);
        document.addEventListener('obra-seleccionada', updateSelectedWork);
    });

    onUnmounted(() => {
        document.removeEventListener('datos-listos', loadWorks);
        document.removeEventListener('obra-seleccionada', updateSelectedWork);
    });

    return { works, selectedWorkId, catalogReady, functionGroups, dateLabel };
}
