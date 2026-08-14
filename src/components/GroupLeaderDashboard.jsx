import React, { useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  Filter,
  Hash,
  RefreshCcw,
  Save,
  Search,
  Timer,
  UserRound,
  UsersRound
} from "lucide-react";
import {
  cancelGroupLeaderActivity,
  createGroupLeaderRecord,
  createIncident,
  friendlyError,
  loadIncidentContext,
  loadGroupLeaderContext,
  updateGroupLeaderActivity,
  updateGroupLeaderRecord
} from "../lib/repository";
import { formatDateTimeLima, limaDateTimeToISO, todayLimaISO } from "../lib/dates";
import {
  getGroupLeaderTaskMode,
  getTaskTitle,
  isGroupLeaderTimeTask,
  normalizeMeasurementType,
  normalizeText,
  taskUsesBrandsByDefault,
  taskUsesGuideBreakdown,
  taskUsesLote,
  taskUsesStore
} from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import { Alert, Button, CheckboxInput, DataTable, LoadingBlock, Panel, SelectInput, Tabs, TextArea, TextInput } from "./ui";
import WorkerDashboard from "./WorkerDashboard";

function createInitialForm() {
  return {
    trabajador_id: "",
    tarea_id: "",
    fecha_registro: todayLimaISO(),
    fecha_fin: todayLimaISO(),
    hora_inicio: "",
    hora_fin: "",
    cantidad: "",
    marca_id: "",
    usaLote: false,
    lote: "",
    usaCodigoGuia: false,
    codigo_guia: "",
    tienda_id: "",
    detalle: ""
  };
}
var initialFilters = {
  scope: "all",
  workerId: "",
  taskId: "",
  search: "",
  order: "desc"
};
function recordSortTime(record) {
  const value = new Date(record.hora_inicio || record.fecha_registro || record.created_at || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}
function GroupLeaderDashboard({ user }) {
  const [workspace, setWorkspace] = useState("Registrar actividad normal");
  const tabs = ["Registrar actividad normal", "Registrar actividad (tiempo)", "Registrar incidencias", "Ranking"];
  return /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement(
    Tabs,
    {
      tabs,
      active: workspace,
      onChange: setWorkspace
    }
  ), workspace === "Registrar actividad normal" ? /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement(Panel, { title: "Registrar actividad normal", eyebrow: "Registro propio" }, /* @__PURE__ */ React.createElement(Alert, null, "Los registros de este apartado quedar\xE1n asociados a tu propio usuario, no al operante.")), /* @__PURE__ */ React.createElement(WorkerDashboard, { user, embedded: true })) : workspace === "Registrar actividad (tiempo)" ? /* @__PURE__ */ React.createElement(GroupTimeDashboard, { user }) : workspace === "Registrar incidencias" ? /* @__PURE__ */ React.createElement(IncidentDashboard, { user }) : /* @__PURE__ */ React.createElement(RankingDashboard, { user }));
}
function RankingDashboard({ user }) {
  const [taskId, setTaskId] = useState("");
  const [topLimit, setTopLimit] = useState("5");
  const { data, loading, error, reload } = useAsyncData(
    loadGroupLeaderContext,
    [user?.id],
    { workers: [], tasks: [], brands: [], stores: [], leaders: [], records: [] }
  );
  const tasks = (data.tasks || []).filter(isGroupLeaderTimeTask);
  const workers = data.workers || [];
  const records = data.records || [];
  const rankingByTask = useMemo(() => {
    const taskIds = new Set(tasks.map((task) => String(task.id)));
    const activeWorkers = new Map(workers.map((worker) => [String(worker.id), worker]));
    const grouped = /* @__PURE__ */ new Map();
    for (const record of records) {
      if (!taskIds.has(String(record.tarea_id))) continue;
      const worker = activeWorkers.get(String(record.trabajador_id));
      if (!worker) continue;
      const cantidad = Number(record.cantidad || 0);
      const minutos = Number(record.tiempo_minutos || 0);
      if (cantidad <= 0 || minutos <= 0) continue;
      const taskKey = String(record.tarea_id);
      if (!grouped.has(taskKey)) grouped.set(taskKey, /* @__PURE__ */ new Map());
      const workersMap = grouped.get(taskKey);
      const workerKey = String(record.trabajador_id);
      const current = workersMap.get(workerKey) || {
        nombre: worker.nombre || worker.email || `ID ${worker.id}`,
        cantidad: 0,
        minutos: 0,
        registros: 0
      };
      current.cantidad += cantidad;
      current.minutos += minutos;
      current.registros += 1;
      workersMap.set(workerKey, current);
    }
    return tasks.map((task) => {
      const workersMap = grouped.get(String(task.id));
      if (!workersMap) return null;
      const ranked = [...workersMap.values()].map((entry) => ({ ...entry, rendimiento: entry.cantidad / entry.minutos * 60 })).sort((a, b) => b.rendimiento - a.rendimiento);
      if (!ranked.length) return null;
      return { id: task.id, nombre: getTaskTitle(task) || `Tarea ${task.id}`, ranked };
    }).filter(Boolean);
  }, [records, tasks, workers]);
  const visibleRanking = taskId ? rankingByTask.filter((item) => String(item.id) === String(taskId)) : rankingByTask;
  const limit = Number(topLimit);
  return /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Ranking por tarea",
      eyebrow: "Rendimiento promedio",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    loading ? /* @__PURE__ */ React.createElement(LoadingBlock, null) : null,
    error ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, error) : null,
    /* @__PURE__ */ React.createElement(Alert, null, "El rendimiento se calcula como cantidad total entre tiempo total, expresado por hora. Solo se consideran las tareas de jefe de equipo que registran cantidad y tiempo, y \xFAnicamente operantes activos."),
    /* @__PURE__ */ React.createElement("div", { className: "history-toolbar" }, /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tarea",
        value: taskId,
        onChange: setTaskId,
        options: [
          { value: "", label: "Todas" },
          ...tasks.map((task) => ({ value: String(task.id), label: getTaskTitle(task) || `ID ${task.id}` }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Mostrar",
        value: topLimit,
        onChange: setTopLimit,
        options: [
          { value: "3", label: "Top 3" },
          { value: "5", label: "Top 5" },
          { value: "10", label: "Top 10" },
          { value: "0", label: "Todos" }
        ]
      }
    )),
    !loading && !visibleRanking.length ? /* @__PURE__ */ React.createElement(Alert, null, "A\xFAn no hay registros con cantidad y tiempo para armar el ranking.") : null
  ), visibleRanking.map((item) => /* @__PURE__ */ React.createElement(Panel, { key: item.id, title: item.nombre, eyebrow: "Top operantes" }, /* @__PURE__ */ React.createElement(
    DataTable,
    {
      rows: (limit ? item.ranked.slice(0, limit) : item.ranked).map((entry, index) => ({
        "#": index + 1,
        Operante: entry.nombre,
        "Rendimiento (por hora)": formatRate(entry.rendimiento),
        "Cantidad total": formatNumber(entry.cantidad),
        "Tiempo total": formatDuration(entry.minutos),
        Registros: entry.registros
      })),
      columns: ["#", "Operante", "Rendimiento (por hora)", "Cantidad total", "Tiempo total", "Registros"],
      compact: true
    }
  ))));
}
var initialIncidentForm = {
  usuario_id: "",
  turno: "turno regular",
  tarea_id: "",
  tienda_id: "",
  numero_guia: "",
  tipo_error: "CONTENIDO",
  observacion: ""
};
function IncidentDashboard({ user }) {
  const [form, setForm] = useState(initialIncidentForm);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    loadIncidentContext,
    [user?.id],
    { workers: [], tasks: [], stores: [], incidents: [] }
  );
  const workers = data.workers || [];
  const tasks = data.tasks || [];
  const stores = data.stores || [];
  const incidents = data.incidents || [];
  const storeNames = useMemo(
    () => new Map(stores.map((store) => [Number(store.id), store.nombre])),
    [stores]
  );
  function updateForm(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    if (!workers.some((worker) => String(worker.id) === String(form.usuario_id))) {
      setStatus({ type: "error", message: "Selecciona un operante." });
      return;
    }
    if (!tasks.some((task) => String(task.id) === String(form.tarea_id))) {
      setStatus({ type: "error", message: "Selecciona una tarea." });
      return;
    }
    if (!stores.some((store) => String(store.id) === String(form.tienda_id))) {
      setStatus({ type: "error", message: "Selecciona una tienda." });
      return;
    }
    if (!form.numero_guia.trim()) {
      setStatus({ type: "error", message: "Ingresa el n\xFAmero de gu\xEDa." });
      return;
    }
    if (!form.tipo_error.trim()) {
      setStatus({ type: "error", message: "Ingresa el tipo de error." });
      return;
    }
    setSaving(true);
    try {
      await createIncident({
        usuario_id: Number(form.usuario_id),
        turno: form.turno,
        tarea_id: Number(form.tarea_id),
        tienda_id: Number(form.tienda_id),
        numero_guia: form.numero_guia.trim(),
        tipo_error: form.tipo_error.trim(),
        observacion: form.observacion.trim() || null
      });
      setForm(initialIncidentForm);
      setStatus({ type: "success", message: "Incidencia registrada correctamente." });
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }
  const rows = incidents.map((incident) => ({
    ID: incident.id,
    Fecha: formatDateTimeLima(incident.created_at),
    Turno: incident.turno,
    Operante: incident.nombre,
    Tarea: incident.tarea_nombre,
    Tienda: incident.tienda_nombre || storeNames.get(Number(incident.tienda_id)) || incident.tienda_id,
    "N\xFAmero de gu\xEDa": incident.numero_guia,
    "Tipo de error": incident.tipo_error,
    Observaci\u00F3n: incident.observacion
  }));
  return /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Registrar incidencia",
      eyebrow: "Jefe de equipo",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    loading ? /* @__PURE__ */ React.createElement(LoadingBlock, null) : null,
    error ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, error) : null,
    status ? /* @__PURE__ */ React.createElement(Alert, { type: status.type }, status.message) : null,
    !loading && !workers.length ? /* @__PURE__ */ React.createElement(Alert, null, "No hay operantes activos.") : null,
    !loading && !stores.length ? /* @__PURE__ */ React.createElement(Alert, null, "No hay tiendas activas registradas.") : null,
    /* @__PURE__ */ React.createElement("form", { className: "form-grid", onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Operante",
        value: form.usuario_id,
        onChange: (usuario_id) => updateForm({ usuario_id }),
        options: [
          { value: "", label: "Selecciona un operante" },
          ...workers.map((worker) => ({
            value: String(worker.id),
            label: `${worker.id} - ${worker.nombre || worker.email}`
          }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Turno",
        value: form.turno,
        onChange: (turno) => updateForm({ turno }),
        options: ["turno regular", "incidencia", "turno extra"]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tarea",
        value: form.tarea_id,
        onChange: (tarea_id) => updateForm({ tarea_id }),
        options: [
          { value: "", label: "Selecciona una tarea" },
          ...tasks.map((task) => ({ value: String(task.id), label: `${task.id} - ${getTaskTitle(task)}` }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tienda",
        value: form.tienda_id,
        onChange: (tienda_id) => updateForm({ tienda_id }),
        options: [
          { value: "", label: "Selecciona una tienda" },
          ...stores.map((store) => ({ value: String(store.id), label: store.nombre }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "N\xFAmero de gu\xEDa",
        value: form.numero_guia,
        onChange: (numero_guia) => updateForm({ numero_guia }),
        placeholder: "Ej. GUIA-001"
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tipo de error",
        value: form.tipo_error,
        onChange: (tipo_error) => updateForm({ tipo_error }),
        options: ["CONTENIDO", "LIBERADO"]
      }
    ), /* @__PURE__ */ React.createElement(
      TextArea,
      {
        label: "Observaci\xF3n",
        value: form.observacion,
        onChange: (observacion) => updateForm({ observacion }),
        placeholder: "Detalle opcional"
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "form-span form-actions" }, /* @__PURE__ */ React.createElement(Button, { type: "submit", icon: Save, loading: saving }, "Guardar incidencia")))
  ), /* @__PURE__ */ React.createElement(Panel, { title: "Historial de incidencias", eyebrow: "Datos registrados" }, /* @__PURE__ */ React.createElement(DataTable, { rows, empty: "Todav\xEDa no hay incidencias registradas.", compact: true })));
}
function GroupTimeDashboard({ user }) {
  const [form, setForm] = useState(createInitialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [rowSaving, setRowSaving] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    loadGroupLeaderContext,
    [user?.id],
    { workers: [], tasks: [], recordTasks: [], brands: [], stores: [], leaders: [], activities: [], records: [], historyMigrationRequired: false }
  );
  const workers = data.workers || [];
  const tasks = data.tasks || [];
  const recordTasks = data.recordTasks || tasks;
  const brands = data.brands || [];
  const stores = data.stores || [];
  const records = data.records || [];
  const selectedTask = useMemo(
    () => tasks.find((task) => String(task.id) === String(form.tarea_id)),
    [tasks, form.tarea_id]
  );
  const selectedWorker = useMemo(
    () => workers.find((worker) => String(worker.id) === String(form.trabajador_id)),
    [workers, form.trabajador_id]
  );
  const taskMode = resolveGroupTaskMode(selectedTask);
  const metrics = useMemo(() => {
    const today = todayLimaISO();
    const mine = records.filter((record) => String(record.encargado_id) === String(user.id));
    return {
      total: mine.length,
      today: mine.filter((record) => String(record.fecha_registro || "").slice(0, 10) === today).length,
      workers: new Set(mine.map((record) => String(record.trabajador_id))).size,
      quantity: mine.reduce((sum, record) => sum + Number(record.cantidad || 0), 0)
    };
  }, [records, user.id]);
  const filteredRecords = useMemo(() => {
    const term = normalizeText(filters.search);
    const filtered = records.filter((record) => {
      if (filters.scope === "mine" && String(record.encargado_id) !== String(user.id)) return false;
      if (filters.workerId && String(record.trabajador_id) !== String(filters.workerId)) return false;
      if (filters.taskId && String(record.tarea_id) !== String(filters.taskId)) return false;
      if (!term) return true;
      return normalizeText(
        [
          record.id,
          record.encargado_nombre,
          record.encargado_email,
          record.trabajador_nombre,
          record.trabajador_email,
          record.tarea_nombre,
          record.codigo_guia,
          record.lote,
          record.marca_nombre,
          record.tienda_nombre,
          record.detalle
        ].join(" ")
      ).includes(term);
    });
    return filtered.sort((a, b) => {
      const diff = recordSortTime(a) - recordSortTime(b);
      return filters.order === "asc" ? diff : -diff;
    });
  }, [filters, records, user.id]);
  const pendingActivities = useMemo(
    () => (data.activities || []).filter((activity) => activity.estado === "EN_CURSO"),
    [data.activities]
  );
  const filteredPending = useMemo(() => {
    const term = normalizeText(filters.search);
    return pendingActivities.filter((activity) => {
      if (filters.scope === "mine" && String(activity.encargado_id) !== String(user.id)) return false;
      if (filters.workerId && String(activity.trabajador_id) !== String(filters.workerId)) return false;
      if (filters.taskId && String(activity.tarea_id) !== String(filters.taskId)) return false;
      if (!term) return true;
      return normalizeText(
        [
          activity.id,
          activity.encargado_nombre,
          activity.encargado_email,
          activity.trabajador_nombre,
          activity.trabajador_email,
          activity.tarea_nombre,
          activity.numero_guia,
          activity.lote,
          activity.marca_nombre,
          activity.tienda_nombre
        ].join(" ")
      ).includes(term);
    });
  }, [filters, pendingActivities, user.id]);
  const combinedRows = useMemo(() => {
    const merged = [
      ...filteredPending.map((activity) => ({ kind: "pending", key: `pending-${activity.id}`, sortTime: recordSortTime(activity), activity })),
      ...filteredRecords.map((record) => ({ kind: "record", key: `record-${record.id}`, sortTime: recordSortTime(record), record }))
    ];
    merged.sort((a, b) => filters.order === "asc" ? a.sortTime - b.sortTime : b.sortTime - a.sortTime);
    return merged;
  }, [filteredPending, filteredRecords, filters.order]);
  function updateForm(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }
  function updateFilters(changes) {
    setFilters((current) => ({ ...current, ...changes }));
  }
  function resetForm() {
    setForm(createInitialForm());
  }
  function buildPayload(draft, revision) {
    const editing = revision !== void 0 && revision !== null;
    const worker = workers.find((item) => String(item.id) === String(draft.trabajador_id));
    const task = (editing ? recordTasks : tasks).find((item) => String(item.id) === String(draft.tarea_id));
    if (!editing && !worker) return { error: "Selecciona un operante activo." };
    if (!task || !isGroupLeaderTimeTask(task)) return { error: "Selecciona una tarea por tiempo valida." };
    const quantity = Number(draft.cantidad);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: "La cantidad debe ser un numero entero mayor a cero." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_registro || "") || draft.fecha_registro > todayLimaISO()) {
      return { error: "Selecciona una fecha valida que no este en el futuro." };
    }
    const finishDate = draft.fecha_fin || draft.fecha_registro;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finishDate) || finishDate < draft.fecha_registro || finishDate > todayLimaISO()) {
      return { error: "La fecha fin debe ser igual o posterior al inicio y no puede estar en el futuro." };
    }
    if (!isValidTime(draft.hora_inicio) || !isValidTime(draft.hora_fin)) {
      return { error: "Completa una hora de inicio y una hora fin validas." };
    }
    const start = limaDateTimeToISO(draft.fecha_registro, draft.hora_inicio);
    const finish = limaDateTimeToISO(finishDate, draft.hora_fin);
    if (!start || !finish || new Date(finish) <= new Date(start)) {
      return { error: "La hora fin debe ser posterior a la hora de inicio." };
    }
    if (new Date(finish).getTime() > Date.now() + 6e4) {
      return { error: "La hora fin no puede estar en el futuro." };
    }
    const requiresBrand = taskUsesBrandsByDefault(task);
    const requiresStore = taskUsesStore(task);
    const allowsLote = taskUsesLote(task);
    const allowsGuide = taskUsesGuideBreakdown(task);
    if (requiresBrand && !draft.marca_id) return { error: `Selecciona una marca para ${getTaskTitle(task)}.` };
    if (requiresStore && !draft.tienda_id) return { error: `Selecciona una tienda para ${getTaskTitle(task)}.` };
    if (allowsGuide && draft.usaCodigoGuia && !String(draft.codigo_guia || "").trim()) {
      return { error: "Ingresa el numero de guia o desactiva esa opcion." };
    }
    if (allowsLote && draft.usaLote && !String(draft.lote || "").trim()) {
      return { error: "Ingresa el codigo de lote o desactiva esa opcion." };
    }
    return {
      payload: {
        trabajador_id: Number(draft.trabajador_id),
        tarea_id: Number(draft.tarea_id),
        fecha_registro: draft.fecha_registro,
        fecha_fin: finishDate,
        hora_inicio: start,
        hora_fin: finish,
        cantidad: quantity,
        marca_id: requiresBrand ? Number(draft.marca_id) : null,
        lote: allowsLote && draft.usaLote ? String(draft.lote).trim().toUpperCase() : null,
        tienda_id: requiresStore ? Number(draft.tienda_id) : null,
        codigo_guia: allowsGuide && draft.usaCodigoGuia ? String(draft.codigo_guia).trim() : null,
        detalle: String(draft.detalle || "").trim() || null,
        ...revision === void 0 || revision === null ? {} : { revision }
      }
    };
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    if (data.historyMigrationRequired) {
      setStatus({ type: "error", message: "Falta aplicar la migracion SQL 027 antes de guardar registros con horas." });
      return;
    }
    const { payload, error: validationError } = buildPayload(form);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }
    setSaving(true);
    try {
      await createGroupLeaderRecord(payload);
      setStatus({ type: "success", message: "Registro guardado en el historial y puntaje recalculado correctamente." });
      resetForm();
      await reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }
  function startEditing(record) {
    if (data.historyMigrationRequired || record.revision === null || record.revision === void 0) return;
    setStatus(null);
    setEditingId(record.id);
    setEditDraft(recordToEditableDraft(record));
  }
  function cancelEditing() {
    setEditingId(null);
    setEditDraft(null);
  }
  async function saveEditedRecord(record) {
    setStatus(null);
    const { payload, error: validationError } = buildPayload(editDraft, record.revision);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }
    setRowSaving(true);
    try {
      await updateGroupLeaderRecord(record.id, payload);
      cancelEditing();
      setStatus({ type: "success", message: `Registro #${record.id} actualizado; tiempo y puntaje fueron recalculados.` });
      await reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
      if (/actualiz|version|otro cambio|409/i.test(String(err?.message || ""))) await reload();
    } finally {
      setRowSaving(false);
    }
  }
  return /* @__PURE__ */ React.createElement("div", { className: "group-dashboard stack" }, /* @__PURE__ */ React.createElement("section", { className: "group-hero" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "eyebrow" }, user.rol || "Jefe de equipo"), /* @__PURE__ */ React.createElement("h2", null, "Control de tareas por tiempo"), /* @__PURE__ */ React.createElement("span", null, user.nombre || user.email)), /* @__PURE__ */ React.createElement("div", { className: "group-metrics", "aria-label": "Resumen de registros" }, /* @__PURE__ */ React.createElement(MetricTile, { icon: ClipboardCheck, label: "Mis registros", value: metrics.total }), /* @__PURE__ */ React.createElement(MetricTile, { icon: Timer, label: "Registros hoy", value: metrics.today }), /* @__PURE__ */ React.createElement(MetricTile, { icon: UserRound, label: "Operantes", value: metrics.workers }), /* @__PURE__ */ React.createElement(MetricTile, { icon: Hash, label: "Cantidad total", value: formatNumber(metrics.quantity) }))), status ? /* @__PURE__ */ React.createElement(Alert, { type: status.type }, status.message) : null, /* @__PURE__ */ React.createElement("div", { className: "group-layout" }, /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Nuevo registro de tiempo",
      eyebrow: "Alta directa al historial",
      className: "group-form-panel",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    loading ? /* @__PURE__ */ React.createElement(LoadingBlock, null) : null,
    error ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, error) : null,
    data.historyMigrationRequired ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, "Falta aplicar la migracion SQL 027 en Supabase para guardar y editar hora inicio, hora fin y revision.") : null,
    /* @__PURE__ */ React.createElement(Alert, null, "Registra el resultado completo. La duracion y el puntaje se calculan en el servidor a partir de las horas, la cantidad y las reglas de la tarea."),
    !loading && !workers.length ? /* @__PURE__ */ React.createElement(Alert, null, "No hay trabajadores operantes activos.") : null,
    !loading && !tasks.length ? /* @__PURE__ */ React.createElement(Alert, null, "No hay tareas registradas en la base de datos.") : null,
    /* @__PURE__ */ React.createElement("form", { className: "group-form form-grid", onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Operante",
        value: form.trabajador_id,
        onChange: (trabajador_id) => updateForm({ trabajador_id }),
        options: [
          { value: "", label: "Selecciona operante" },
          ...workers.map((worker) => ({
            value: String(worker.id),
            label: `${worker.nombre || worker.email} - ${worker.email || `ID ${worker.id}`}`
          }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tarea",
        value: form.tarea_id,
        onChange: (tarea_id) => updateForm(resetTaskMetadata({ tarea_id })),
        options: [
          { value: "", label: "Selecciona tarea" },
          ...tasks.map((task) => ({
            value: String(task.id),
            label: getTaskTitle(task) || "Sin nombre"
          }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "Fecha",
        type: "date",
        value: form.fecha_registro,
        onChange: (fecha_registro) => updateForm({ fecha_registro }),
        max: todayLimaISO()
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "Fecha fin",
        type: "date",
        min: form.fecha_registro,
        max: todayLimaISO(),
        value: form.fecha_fin,
        onChange: (fecha_fin) => updateForm({ fecha_fin })
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "Hora de inicio",
        type: "time",
        value: form.hora_inicio,
        onChange: (hora_inicio) => updateForm({ hora_inicio })
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "Hora fin",
        type: "time",
        value: form.hora_fin,
        onChange: (hora_fin) => updateForm({ hora_fin })
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: quantityLabel(selectedTask),
        type: "number",
        min: "1",
        step: "1",
        value: form.cantidad,
        onChange: (cantidad) => updateForm({ cantidad }),
        hint: "El total terminado dentro de este intervalo."
      }
    ), selectedTask ? /* @__PURE__ */ React.createElement(
      DynamicGroupFields,
      {
        mode: taskMode,
        task: selectedTask,
        form,
        updateForm,
        brands,
        stores
      }
    ) : null, /* @__PURE__ */ React.createElement(
      TextArea,
      {
        label: "Detalle",
        value: form.detalle,
        onChange: (detalle) => updateForm({ detalle }),
        placeholder: taskMode.completedOnly ? "Realizado" : "Comentario opcional"
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "form-span form-note group-registrar" }, /* @__PURE__ */ React.createElement(BadgeCheck, null), /* @__PURE__ */ React.createElement("span", null, "Registrado por: ", /* @__PURE__ */ React.createElement("strong", null, user.nombre || user.email))), /* @__PURE__ */ React.createElement("div", { className: "form-span form-actions" }, /* @__PURE__ */ React.createElement(Button, { type: "submit", icon: Save, loading: saving, disabled: data.historyMigrationRequired }, "Guardar en historial")))
  ), /* @__PURE__ */ React.createElement(Panel, { title: "Seleccion actual", eyebrow: "Reglas de tarea", className: "group-context-panel" }, /* @__PURE__ */ React.createElement("div", { className: "selection-list" }, /* @__PURE__ */ React.createElement(SelectionLine, { icon: UsersRound, label: "Operante", value: selectedWorker?.nombre || selectedWorker?.email || "-" }), /* @__PURE__ */ React.createElement(SelectionLine, { icon: ClipboardCheck, label: "Tarea", value: getTaskTitle(selectedTask) || "-" }), /* @__PURE__ */ React.createElement(SelectionLine, { icon: Filter, label: "Tipo", value: taskMode.label }), /* @__PURE__ */ React.createElement(
    SelectionLine,
    {
      icon: Timer,
      label: "Duracion",
      value: previewDuration(form.fecha_registro, form.hora_inicio, form.fecha_fin, form.hora_fin)
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "mode-pills" }, modePills(taskMode).map((pill) => /* @__PURE__ */ React.createElement("span", { key: pill }, pill))))), /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Historial editable",
      eyebrow: "Listado principal de la base de datos",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    /* @__PURE__ */ React.createElement(Alert, null, "Edita inicio, fin, cantidad y datos asociados directamente en la fila. Al guardar, el tiempo y el puntaje se recalculan. Las filas en curso muestran solo lo que falta completar para finalizarlas aqui mismo. Los registros de otros jefes son de solo lectura."),
    /* @__PURE__ */ React.createElement("div", { className: "history-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "scope-switch", "aria-label": "Alcance de registros" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: filters.scope === "all" ? "active" : "",
        onClick: () => updateFilters({ scope: "all" })
      },
      "Todos"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: filters.scope === "mine" ? "active" : "",
        onClick: () => updateFilters({ scope: "mine" })
      },
      "Mios"
    )), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Operante",
        value: filters.workerId,
        onChange: (workerId) => updateFilters({ workerId }),
        options: [
          { value: "", label: "Todos" },
          ...workers.map((worker) => ({
            value: String(worker.id),
            label: worker.nombre || worker.email || `ID ${worker.id}`
          }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Tarea",
        value: filters.taskId,
        onChange: (taskId) => updateFilters({ taskId }),
        options: [
          { value: "", label: "Todas" },
          ...recordTasks.map((task) => ({
            value: String(task.id),
            label: getTaskTitle(task) || `ID ${task.id}`
          }))
        ]
      }
    ), /* @__PURE__ */ React.createElement(
      SelectInput,
      {
        label: "Ordenar por fecha",
        value: filters.order,
        onChange: (order) => updateFilters({ order }),
        options: [
          { value: "desc", label: "M\xE1s reciente primero" },
          { value: "asc", label: "M\xE1s antigua primero" }
        ]
      }
    ), /* @__PURE__ */ React.createElement("label", { className: "field search-field" }, /* @__PURE__ */ React.createElement("span", { className: "field-label" }, "Buscar"), /* @__PURE__ */ React.createElement("span", { className: "search-input" }, /* @__PURE__ */ React.createElement(Search, null), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "input",
        value: filters.search,
        onChange: (event) => updateFilters({ search: event.target.value }),
        placeholder: "Nombre, tarea, guia, lote, marca"
      }
    )))),
    /* @__PURE__ */ React.createElement(
      EditableGroupHistory,
      {
        rows: combinedRows,
        tasks: recordTasks,
        brands,
        stores,
        currentUserId: user.id,
        editingDisabled: data.historyMigrationRequired,
        editingId,
        draft: editDraft,
        saving: rowSaving,
        onEdit: startEditing,
        onDraft: setEditDraft,
        onSave: saveEditedRecord,
        onCancel: cancelEditing,
        onReload: reload,
        onStatus: setStatus
      }
    )
  ));
}
function EditableGroupHistory({
  rows,
  tasks,
  brands,
  stores,
  currentUserId,
  editingDisabled,
  editingId,
  draft,
  saving,
  onEdit,
  onDraft,
  onSave,
  onCancel,
  onReload,
  onStatus
}) {
  if (!rows.length) return /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "Sin registros para los filtros actuales.");
  return /* @__PURE__ */ React.createElement("div", { className: "editable-history-wrap", role: "region", "aria-label": "Historial editable de tareas", tabIndex: "0" }, /* @__PURE__ */ React.createElement("table", { className: "editable-history-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ID"), /* @__PURE__ */ React.createElement("th", null, "Fecha"), /* @__PURE__ */ React.createElement("th", null, "Encargado"), /* @__PURE__ */ React.createElement("th", null, "Operante"), /* @__PURE__ */ React.createElement("th", null, "Tarea"), /* @__PURE__ */ React.createElement("th", null, "Hora inicio"), /* @__PURE__ */ React.createElement("th", null, "Hora fin"), /* @__PURE__ */ React.createElement("th", null, "Cantidad"), /* @__PURE__ */ React.createElement("th", null, "Tiempo"), /* @__PURE__ */ React.createElement("th", null, "Numero de guia"), /* @__PURE__ */ React.createElement("th", null, "Codigo de lote"), /* @__PURE__ */ React.createElement("th", null, "Marca"), /* @__PURE__ */ React.createElement("th", null, "Tienda"), /* @__PURE__ */ React.createElement("th", null, "Detalle"), /* @__PURE__ */ React.createElement("th", null, "Puntaje"), /* @__PURE__ */ React.createElement("th", { className: "history-actions-heading" }, "Acciones"))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((row) => {
    if (row.kind === "pending") {
      return /* @__PURE__ */ React.createElement(PendingActivityRow, {
        key: row.key,
        activity: row.activity,
        tasks,
        brands,
        currentUserId,
        onReload,
        onStatus
      });
    }
    const record = row.record;
    const mine = String(record.encargado_id) === String(currentUserId);
    const editable = mine && !editingDisabled && record.revision !== null && record.revision !== void 0;
    if (String(editingId) === String(record.id) && draft) {
      return /* @__PURE__ */ React.createElement(
        EditableHistoryRow,
        {
          key: row.key,
          record,
          draft,
          tasks,
          brands,
          stores,
          saving,
          onDraft,
          onSave: () => onSave(record),
          onCancel
        }
      );
    }
    return /* @__PURE__ */ React.createElement(
      HistoryRow,
      {
        key: row.key,
        record,
        editable,
        readonlyReason: mine && record.revision == null ? "Registro anterior" : editingDisabled && mine ? "Migracion pendiente" : "Solo lectura",
        onEdit: () => onEdit(record)
      }
    );
  }))));
}
function HistoryRow({ record, editable, readonlyReason, onEdit }) {
  return /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { className: "history-id-cell" }, "#", record.id), /* @__PURE__ */ React.createElement("td", null, formatRecordDate(record)), /* @__PURE__ */ React.createElement("td", null, record.encargado_nombre || record.encargado_email || "-"), /* @__PURE__ */ React.createElement("td", null, record.trabajador_nombre || record.trabajador_email || "-"), /* @__PURE__ */ React.createElement("td", null, record.tarea_nombre || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-time-cell" }, formatTimeLima(record.hora_inicio)), /* @__PURE__ */ React.createElement("td", { className: "history-time-cell" }, formatTimeLima(record.hora_fin)), /* @__PURE__ */ React.createElement("td", { className: "history-number-cell" }, formatNumber(record.cantidad) || "-"), /* @__PURE__ */ React.createElement("td", null, formatDuration(record.tiempo_minutos) || "-"), /* @__PURE__ */ React.createElement("td", null, record.codigo_guia || "-"), /* @__PURE__ */ React.createElement("td", null, record.lote || "-"), /* @__PURE__ */ React.createElement("td", null, record.marca_nombre || "-"), /* @__PURE__ */ React.createElement("td", null, record.tienda_nombre || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-detail-cell", title: record.detalle || "" }, record.detalle || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-score-cell" }, formatScore(record.puntaje)), /* @__PURE__ */ React.createElement("td", { className: "history-actions-cell" }, editable ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "history-edit-button", onClick: onEdit }, "Editar") : /* @__PURE__ */ React.createElement("span", { className: "history-readonly-badge" }, readonlyReason)));
}
function EditableHistoryRow({ record, draft, tasks, brands, stores, saving, onDraft, onSave, onCancel }) {
  const selectedTask = tasks.find((task) => String(task.id) === String(draft.tarea_id));
  const usesBrand = taskUsesBrandsByDefault(selectedTask);
  const usesLote = taskUsesLote(selectedTask);
  const usesStore = taskUsesStore(selectedTask);
  const usesGuide = taskUsesGuideBreakdown(selectedTask);
  const updateDraft = (changes) => onDraft((current) => ({ ...current, ...changes }));
  const start = limaDateTimeToISO(draft.fecha_registro, draft.hora_inicio);
  const finish = limaDateTimeToISO(draft.fecha_registro, draft.hora_fin);
  return /* @__PURE__ */ React.createElement("tr", { className: "history-editing-row" }, /* @__PURE__ */ React.createElement("td", { className: "history-id-cell" }, "#", record.id), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input history-date-input",
      type: "date",
      "aria-label": `Fecha del registro ${record.id}`,
      max: todayLimaISO(),
      value: draft.fecha_registro,
      onChange: (event) => updateDraft({ fecha_registro: event.target.value })
    }
  )), /* @__PURE__ */ React.createElement("td", null, record.encargado_nombre || record.encargado_email || "Tu registro"), /* @__PURE__ */ React.createElement("td", null, record.trabajador_nombre || record.trabajador_email || "-"), /* @__PURE__ */ React.createElement("td", null, record.tarea_nombre || getTaskTitle(selectedTask) || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input history-time-input",
      type: "time",
      "aria-label": `Hora inicio del registro ${record.id}`,
      value: draft.hora_inicio,
      onChange: (event) => updateDraft({ hora_inicio: event.target.value })
    }
  )), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input history-time-input",
      type: "time",
      "aria-label": `Hora fin del registro ${record.id}`,
      value: draft.hora_fin,
      onChange: (event) => updateDraft({ hora_fin: event.target.value })
    }
  )), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input history-quantity-input",
      type: "number",
      min: "1",
      step: "1",
      "aria-label": `Cantidad del registro ${record.id}`,
      value: draft.cantidad,
      onChange: (event) => updateDraft({ cantidad: event.target.value })
    }
  )), /* @__PURE__ */ React.createElement("td", { className: "history-preview-cell" }, start && finish ? formatDurationFromDates(start, finish) : "Pendiente"), /* @__PURE__ */ React.createElement("td", null, usesGuide ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input",
      "aria-label": `Numero de guia del registro ${record.id}`,
      value: draft.codigo_guia,
      onChange: (event) => updateDraft({ usaCodigoGuia: Boolean(event.target.value), codigo_guia: event.target.value }),
      placeholder: "Opcional"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, usesLote ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input",
      "aria-label": `Codigo de lote del registro ${record.id}`,
      value: draft.lote,
      onChange: (event) => updateDraft({ usaLote: Boolean(event.target.value), lote: event.target.value.toUpperCase() }),
      placeholder: "Opcional"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, usesBrand ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "history-cell-input history-select-input",
      "aria-label": `Marca del registro ${record.id}`,
      value: draft.marca_id,
      onChange: (event) => updateDraft({ marca_id: event.target.value })
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecciona"),
    brands.map((brand) => /* @__PURE__ */ React.createElement("option", { key: brand.id, value: String(brand.id) }, brand.nombre))
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, usesStore ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "history-cell-input history-select-input",
      "aria-label": `Tienda del registro ${record.id}`,
      value: draft.tienda_id,
      onChange: (event) => updateDraft({ tienda_id: event.target.value })
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecciona"),
    stores.map((store) => /* @__PURE__ */ React.createElement("option", { key: store.id, value: String(store.id) }, store.nombre))
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input history-detail-input",
      "aria-label": `Detalle del registro ${record.id}`,
      value: draft.detalle,
      onChange: (event) => updateDraft({ detalle: event.target.value }),
      placeholder: "Opcional"
    }
  )), /* @__PURE__ */ React.createElement("td", { className: "history-preview-cell" }, "Se recalcula"), /* @__PURE__ */ React.createElement("td", { className: "history-actions-cell" }, /* @__PURE__ */ React.createElement("div", { className: "history-row-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "history-save-button", disabled: saving, onClick: onSave }, saving ? "Guardando..." : "Guardar"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "history-cancel-button", disabled: saving, onClick: onCancel }, "Cancelar"))));
}
function PendingActivityRow({ activity, tasks, brands, currentUserId, onReload, onStatus }) {
  const mine = String(activity.encargado_id) === String(currentUserId);
  const task = tasks.find((item) => String(item.id) === String(activity.tarea_id)) || { nombre: activity.tarea_nombre };
  const usesBrand = taskUsesBrandsByDefault(task);
  const usesLote = taskUsesLote(task);
  const minFinishDate = recordDateInput(activity);
  const [draft, setDraft] = useState(() => ({
    cantidad: String(Math.max(1, Number(activity.cantidad || 0))),
    fecha_fin: todayLimaISO(),
    hora_fin: "",
    marca_id: activity.marca_id ? String(activity.marca_id) : "",
    lote: activity.lote || ""
  }));
  const [busy, setBusy] = useState(false);
  const updateDraft = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const finishIso = limaDateTimeToISO(draft.fecha_fin, draft.hora_fin);
  const finishValid = Boolean(finishIso) && new Date(finishIso) > new Date(activity.hora_inicio);
  const durationPreview = finishValid ? formatDurationFromDates(activity.hora_inicio, finishIso) : "Pendiente";

  async function finish() {
    const quantity = Number(draft.cantidad);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity < Number(activity.cantidad || 0)) {
      onStatus({ type: "error", message: `Revisa la cantidad pendiente de la actividad #${activity.id}.` });
      return;
    }
    if (!finishValid || new Date(finishIso).getTime() > Date.now() + 60000) {
      onStatus({ type: "error", message: `La hora fin de la actividad #${activity.id} debe ser posterior al inicio y no puede estar en el futuro.` });
      return;
    }
    if (usesBrand && !draft.marca_id) {
      onStatus({ type: "error", message: `Selecciona la marca para finalizar la actividad #${activity.id}.` });
      return;
    }
    setBusy(true);
    try {
      await updateGroupLeaderActivity(activity.id, {
        cantidad: quantity,
        ...(usesBrand ? { marca_id: Number(draft.marca_id) } : {}),
        ...(usesLote ? { lote: String(draft.lote || "").trim().toUpperCase() || null } : {}),
        finalizar: true,
        hora_fin: finishIso
      });
      onStatus({ type: "success", message: `Actividad #${activity.id} finalizada y enviada al historial.` });
      await onReload();
    } catch (error) {
      onStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm(`¿Cancelar la actividad en curso #${activity.id} de ${activity.trabajador_nombre}? Esta accion elimina sus avances y no se puede deshacer.`)) return;
    setBusy(true);
    try {
      await cancelGroupLeaderActivity(activity.id);
      onStatus({ type: "success", message: `Actividad #${activity.id} cancelada.` });
      await onReload();
    } catch (error) {
      onStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="history-pending-row">
      <td className="history-id-cell">#{activity.id}<span className="history-pending-badge">En curso</span></td>
      <td>{formatRecordDate(activity)}</td>
      <td>{activity.encargado_nombre || activity.encargado_email || "-"}</td>
      <td>{activity.trabajador_nombre || activity.trabajador_email || "-"}</td>
      <td>{activity.tarea_nombre || "-"}</td>
      <td className="history-time-cell">{formatTimeLima(activity.hora_inicio)}</td>
      <td>
        {mine ? (
          <div className="history-pending-finish-inputs">
            <input
              className="history-cell-input history-date-input"
              type="date"
              min={minFinishDate}
              max={todayLimaISO()}
              value={draft.fecha_fin}
              disabled={busy}
              aria-label={`Fecha fin actividad ${activity.id}`}
              onChange={(event) => updateDraft({ fecha_fin: event.target.value })}
            />
            <input
              className="history-cell-input history-time-input"
              type="time"
              value={draft.hora_fin}
              disabled={busy}
              aria-label={`Hora fin actividad ${activity.id}`}
              onChange={(event) => updateDraft({ hora_fin: event.target.value })}
            />
          </div>
        ) : <span className="muted">En curso</span>}
      </td>
      <td className="history-number-cell">
        {mine ? (
          <input
            className="history-cell-input history-quantity-input"
            type="number"
            min={Math.max(1, Number(activity.cantidad || 0))}
            step="1"
            value={draft.cantidad}
            disabled={busy}
            aria-label={`Cantidad final actividad ${activity.id}`}
            onChange={(event) => updateDraft({ cantidad: event.target.value })}
          />
        ) : formatNumber(activity.cantidad)}
      </td>
      <td>{durationPreview}</td>
      <td>{activity.numero_guia || activity.codigo_guia || "-"}</td>
      <td>
        {usesLote ? (
          mine ? (
            <input
              className="history-cell-input"
              value={draft.lote}
              disabled={busy}
              placeholder="Opcional"
              aria-label={`Lote actividad ${activity.id}`}
              onChange={(event) => updateDraft({ lote: event.target.value.toUpperCase() })}
            />
          ) : (activity.lote || "-")
        ) : <span className="muted">No aplica</span>}
      </td>
      <td>
        {usesBrand ? (
          mine ? (
            <select
              className="history-cell-input history-select-input"
              value={draft.marca_id}
              disabled={busy}
              aria-label={`Marca actividad ${activity.id}`}
              onChange={(event) => updateDraft({ marca_id: event.target.value })}
            >
              <option value="">Selecciona</option>
              {brands.map((brand) => <option key={brand.id} value={String(brand.id)}>{brand.nombre}</option>)}
            </select>
          ) : (activity.marca_nombre || "-")
        ) : <span className="muted">No aplica</span>}
      </td>
      <td>{activity.tienda_nombre || <span className="muted">No aplica</span>}</td>
      <td className="history-detail-cell" title={activity.detalle || activity.observacion || ""}>{activity.detalle || activity.observacion || "-"}</td>
      <td className="history-score-cell">Pendiente</td>
      <td className="history-actions-cell">
        {mine ? (
          <div className="history-row-actions">
            <button type="button" className="history-save-button" disabled={busy} onClick={finish}>{busy ? "Guardando..." : "Finalizar"}</button>
            <button type="button" className="history-cancel-button" disabled={busy} onClick={cancel}>Cancelar</button>
          </div>
        ) : <span className="history-readonly-badge">En curso · otro jefe</span>}
      </td>
    </tr>
  );
}
function DynamicGroupFields({ mode, task, form, updateForm, brands, stores }) {
  if (mode.completedOnly) {
    return /* @__PURE__ */ React.createElement("div", { className: "form-span" }, /* @__PURE__ */ React.createElement(Alert, null, "Esta tarea se guarda como realizado."));
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, mode.requiresBrand ? /* @__PURE__ */ React.createElement(
    SelectInput,
    {
      label: "Marca",
      value: form.marca_id,
      onChange: (marca_id) => updateForm({ marca_id }),
      options: [
        { value: "", label: "Selecciona marca" },
        ...(brands || []).map((brand) => ({ value: String(brand.id), label: brand.nombre }))
      ],
      hint: "Obligatoria para guardar esta tarea."
    }
  ) : null, mode.requiresLote ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    CheckboxInput,
    {
      label: "A\xF1adir codigo de lote",
      checked: form.usaLote,
      onChange: (usaLote) => updateForm({ usaLote, lote: usaLote ? form.lote : "" }),
      hint: "Opcional para Etiquetado."
    }
  ), form.usaLote ? /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: "Codigo de lote",
      value: form.lote,
      onChange: (lote) => updateForm({ lote: lote.toUpperCase() }),
      placeholder: "Ej. A05"
    }
  ) : null) : null, mode.requiresStore ? /* @__PURE__ */ React.createElement(
    SelectInput,
    {
      label: "Tienda",
      value: form.tienda_id,
      onChange: (tienda_id) => updateForm({ tienda_id }),
      options: [
        { value: "", label: "Selecciona tienda" },
        ...(stores || []).map((store) => ({ value: String(store.id), label: store.nombre }))
      ],
      hint: "Igual que en el registro del operante para esta tarea."
    }
  ) : null, taskUsesGuideBreakdown(task) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    CheckboxInput,
    {
      label: "A\xF1adir n\xFAmero de gu\xEDa",
      checked: form.usaCodigoGuia,
      onChange: (usaCodigoGuia) => updateForm({ usaCodigoGuia, codigo_guia: usaCodigoGuia ? form.codigo_guia : "" }),
      hint: "Igual que en el registro del operante para esta tarea."
    }
  ), form.usaCodigoGuia ? /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: "N\xFAmero de gu\xEDa",
      value: form.codigo_guia,
      onChange: (codigo_guia) => updateForm({ codigo_guia }),
      placeholder: "Ej. GUIA-001"
    }
  ) : null) : null);
}
function resolveGroupTaskMode(task) {
  if (!task) {
    return {
      mode: "none",
      label: "-",
      requiresQuantity: true,
      requiresGuideCode: false,
      requiresTime: false,
      requiresLote: false,
      requiresBrand: false,
      requiresStore: false,
      completedOnly: false
    };
  }
  const mode = getGroupLeaderTaskMode(getTaskTitle(task));
  const measurementType = normalizeMeasurementType(task?.tipo_medicion);
  const extraName = normalizeText(task?.nombre_dato_extra);
  if (isGroupLeaderTimeTask(task)) {
    return {
      ...mode,
      mode: "tiempo",
      label: "Cantidad y tiempo",
      requiresQuantity: true,
      requiresGuideCode: taskUsesGuideBreakdown(task),
      requiresTime: true,
      requiresLote: taskUsesLote(task),
      // Las mismas tareas por tiempo piden aqui los mismos datos que ya le
      // pide el operante para esa tarea: marca en Etiquetado, tienda en
      // Picking/Visita de tienda.
      requiresBrand: taskUsesBrandsByDefault(task),
      requiresStore: taskUsesStore(task),
      completedOnly: false
    };
  }
  if (extraName.includes("lote")) {
    return {
      ...mode,
      mode: "lote",
      label: "Lote",
      requiresQuantity: true,
      requiresTime: false,
      requiresLote: true,
      completedOnly: false
    };
  }
  if (measurementType === "turno" && mode.mode === "cantidad") {
    return {
      mode: "turno",
      label: "Turno realizado",
      requiresQuantity: false,
      requiresGuideCode: false,
      requiresTime: false,
      requiresLote: false,
      completedOnly: true
    };
  }
  return mode;
}
function modePills(mode) {
  if (mode.mode === "none") return ["Sin tarea"];
  const pills = [];
  if (mode.completedOnly) pills.push("Realizado");
  if (mode.requiresQuantity) pills.push("Cantidad");
  if (mode.requiresTime) pills.push("Tiempo");
  if (mode.requiresGuideCode) pills.push("Codigo guia");
  if (mode.requiresLote) pills.push("Lote en tarjeta");
  if (mode.requiresBrand) pills.push("Marca en tarjeta");
  if (mode.requiresStore) pills.push("Tienda");
  return pills.length ? pills : ["Registro"];
}
function resetTaskMetadata({ tarea_id }) {
  return {
    tarea_id,
    marca_id: "",
    usaLote: false,
    lote: "",
    tienda_id: "",
    usaCodigoGuia: false,
    codigo_guia: ""
  };
}
function recordToEditableDraft(record) {
  return {
    trabajador_id: String(record.trabajador_id || ""),
    tarea_id: String(record.tarea_id || ""),
    fecha_registro: recordDateInput(record),
    hora_inicio: timeInputValue(record.hora_inicio),
    hora_fin: timeInputValue(record.hora_fin),
    cantidad: String(record.cantidad ?? ""),
    marca_id: record.marca_id ? String(record.marca_id) : "",
    usaLote: Boolean(record.lote),
    lote: record.lote || "",
    tienda_id: record.tienda_id ? String(record.tienda_id) : "",
    usaCodigoGuia: Boolean(record.codigo_guia || record.numero_guia),
    codigo_guia: record.codigo_guia || record.numero_guia || "",
    detalle: record.detalle || record.observacion || ""
  };
}
function recordDateInput(record) {
  const stored = String(record.fecha_registro || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return limaDatePart(record.hora_inicio) || limaDatePart(record.created_at) || todayLimaISO();
}
function formatRecordDate(record) {
  const value = recordDateInput(record);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function limaDatePart(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
function timeInputValue(value) {
  if (!value) return "";
  const direct = String(value).match(/^(\d{2}):(\d{2})/);
  if (direct) return `${direct[1]}:${direct[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.hour}:${byType.minute}`;
}
function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}
function previewDuration(date, startTime, finishTime) {
  if (!date || !isValidTime(startTime) || !isValidTime(finishTime)) return "Completa las horas";
  const start = limaDateTimeToISO(date, startTime);
  const finish = limaDateTimeToISO(date, finishTime);
  if (!start || !finish || new Date(finish) <= new Date(start)) return "Revisa el intervalo";
  return formatDurationFromDates(start, finish);
}
function quantityLabel() {
  return "Cantidad realizada";
}
function formatScore(value) {
  if (value === null || value === void 0 || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toLocaleString("es-PE", { maximumFractionDigits: 2 })} pts`;
}
function MetricTile({ icon: Icon2, label, value }) {
  return /* @__PURE__ */ React.createElement("div", { className: "group-metric" }, /* @__PURE__ */ React.createElement(Icon2, null), /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("strong", null, value));
}
function SelectionLine({ icon: Icon2, label, value }) {
  return /* @__PURE__ */ React.createElement("div", { className: "selection-line" }, /* @__PURE__ */ React.createElement(Icon2, null), /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("strong", null, value));
}
function formatNumber(value) {
  if (value === null || value === void 0 || value === "") return "";
  return Number(value).toLocaleString("es-PE");
}
function formatRate(value) {
  return Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function formatDuration(value) {
  const total = Number(value || 0);
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
function formatTimeLima(value) {
  if (!value) return "--:--";
  const direct = String(value).match(/^(\d{2}):(\d{2})/);
  if (direct) return `${direct[1]}:${direct[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
function formatDurationFromDates(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return "0 min";
  return formatDuration(Math.max(1, Math.round((end.getTime() - start.getTime()) / 6e4)));
}

export default GroupLeaderDashboard;
