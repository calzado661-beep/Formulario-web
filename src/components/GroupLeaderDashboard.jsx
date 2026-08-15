import React, { useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  Hash,
  RefreshCcw,
  Save,
  Search,
  Timer,
  UserRound
} from "lucide-react";
import {
  cancelGroupLeaderActivity,
  createGroupLeaderRecord,
  createIncident,
  deleteGroupLeaderRecord,
  friendlyError,
  loadIncidentContext,
  loadGroupLeaderContext,
  updateGroupLeaderActivity,
  updateGroupLeaderRecord
} from "../lib/repository";
import { formatDateTimeLima, limaDateTimeToISO, todayLimaISO } from "../lib/dates";
import {
  getGroupLeaderTaskMode,
  getTaskFieldFlags,
  getTaskTitle,
  isGroupLeaderTimeTask,
  normalizeMeasurementType,
  normalizeText
} from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import {
  Alert,
  Button,
  DataTable,
  DEFAULT_PAGE_SIZE,
  LoadingBlock,
  Panel,
  SelectInput,
  TablePager,
  Tabs,
  TextArea,
  TextInput,
  usePagination
} from "./ui";
import WorkerDashboard, { HANGTAG_OPTIONS } from "./WorkerDashboard";

function createInitialForm() {
  return {
    trabajador_id: "",
    tarea_id: "",
    fecha_registro: todayLimaISO(),
    hora_inicio: "",
    marca_id: "",
    lote: "",
    tipo_etiquetado: "",
    numero_guia: "",
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_registro || "") || draft.fecha_registro > todayLimaISO()) {
      return { error: "Selecciona una fecha de inicio valida que no este en el futuro." };
    }
    if (!isValidTime(draft.hora_inicio)) {
      return { error: "Completa una hora de inicio valida." };
    }
    const start = limaDateTimeToISO(draft.fecha_registro, draft.hora_inicio);
    if (!start) return { error: "Completa una hora de inicio valida." };
    if (new Date(start).getTime() > Date.now() + 6e4) {
      return { error: "La hora de inicio no puede estar en el futuro." };
    }
    const fields = getTaskFieldFlags(task);
    if (fields.marca && !draft.marca_id) return { error: `Selecciona una marca para ${getTaskTitle(task)}.` };
    if (fields.tienda && !draft.tienda_id) return { error: `Selecciona una tienda para ${getTaskTitle(task)}.` };
    if (fields.hangtag && !draft.tipo_etiquetado) {
      return { error: `Indica si ${getTaskTitle(task)} va con hangtag o sin hangtag.` };
    }
    const base = {
      trabajador_id: Number(draft.trabajador_id),
      tarea_id: Number(draft.tarea_id),
      fecha_registro: draft.fecha_registro,
      hora_inicio: start,
      marca_id: fields.marca ? Number(draft.marca_id) : null,
      lote: fields.lote ? String(draft.lote || "").trim().toUpperCase() || null : null,
      tipo_etiquetado: fields.hangtag ? draft.tipo_etiquetado || null : null,
      numero_guia: fields.guia ? String(draft.numero_guia || "").trim() || null : null,
      tienda_id: fields.tienda ? Number(draft.tienda_id) : null,
      detalle: String(draft.detalle || "").trim() || null,
      ...revision === void 0 || revision === null ? {} : { revision }
    };
    // Mientras no haya cierre, el registro queda pendiente: la cantidad y la
    // hora fin se completan despues desde el historial.
    const quantityText = String(draft.cantidad ?? "").trim();
    if (!draft.hora_fin && !quantityText) {
      return { payload: { ...base, hora_fin: null, cantidad: null } };
    }
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: "La cantidad debe ser un numero entero mayor a cero." };
    }
    const finishDate = draft.fecha_fin || draft.fecha_registro;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finishDate) || finishDate < draft.fecha_registro || finishDate > todayLimaISO()) {
      return { error: "La fecha fin debe ser igual o posterior al inicio y no puede estar en el futuro." };
    }
    if (!isValidTime(draft.hora_fin)) {
      return { error: "Completa una hora fin valida para cerrar el registro." };
    }
    const finish = limaDateTimeToISO(finishDate, draft.hora_fin);
    if (!finish || new Date(finish) <= new Date(start)) {
      return { error: "La hora fin debe ser posterior a la hora de inicio." };
    }
    if (new Date(finish).getTime() > Date.now() + 6e4) {
      return { error: "La hora fin no puede estar en el futuro." };
    }
    return { payload: { ...base, fecha_fin: finishDate, hora_fin: finish, cantidad: quantity } };
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
      setStatus({ type: "success", message: "Inicio guardado en el historial. Completa la cantidad y el cierre editando esa fila." });
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
  async function removeRecord(record) {
    setStatus(null);
    setRowSaving(true);
    try {
      await deleteGroupLeaderRecord(record.id, record.revision ?? null);
      if (String(editingId) === String(record.id)) cancelEditing();
      setStatus({ type: "success", message: `Registro #${record.id} eliminado del historial.` });
      await reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
      if (/otra sesion|409|ya no existe/i.test(String(err?.message || ""))) await reload();
    } finally {
      setRowSaving(false);
    }
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
  return /* @__PURE__ */ React.createElement("div", { className: "group-dashboard stack" }, /* @__PURE__ */ React.createElement("section", { className: "group-hero" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "eyebrow" }, user.rol || "Jefe de equipo"), /* @__PURE__ */ React.createElement("h2", null, "Control de tareas por tiempo"), /* @__PURE__ */ React.createElement("span", null, user.nombre || user.email)), /* @__PURE__ */ React.createElement("div", { className: "group-metrics", "aria-label": "Resumen de registros" }, /* @__PURE__ */ React.createElement(MetricTile, { icon: ClipboardCheck, label: "Mis registros", value: metrics.total }), /* @__PURE__ */ React.createElement(MetricTile, { icon: Timer, label: "Registros hoy", value: metrics.today }), /* @__PURE__ */ React.createElement(MetricTile, { icon: UserRound, label: "Operantes", value: metrics.workers }), /* @__PURE__ */ React.createElement(MetricTile, { icon: Hash, label: "Cantidad total", value: formatNumber(metrics.quantity) }))), status ? /* @__PURE__ */ React.createElement(Alert, { type: status.type }, status.message) : null, /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Iniciar registro de tarea",
      eyebrow: "Alta directa al historial",
      className: "group-form-panel",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    loading ? /* @__PURE__ */ React.createElement(LoadingBlock, null) : null,
    error ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, error) : null,
    data.historyMigrationRequired ? /* @__PURE__ */ React.createElement(Alert, { type: "error" }, "Falta aplicar la migracion SQL 027 en Supabase para guardar y editar hora inicio, hora fin y revision.") : null,
    /* @__PURE__ */ React.createElement(Alert, null, "Registra el inicio de la tarea. La cantidad y la fecha y hora de fin se completan despues en el historial; ahi el servidor recalcula la duracion y el puntaje."),
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
        label: "Fecha de inicio",
        type: "date",
        value: form.fecha_registro,
        onChange: (fecha_registro) => updateForm({ fecha_registro }),
        max: todayLimaISO()
      }
    ), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: "Hora de inicio",
        type: "time",
        value: form.hora_inicio,
        onChange: (hora_inicio) => updateForm({ hora_inicio }),
        hint: "La cantidad y el cierre se completan despues en el historial."
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
    ), /* @__PURE__ */ React.createElement("div", { className: "form-span form-note group-registrar" }, /* @__PURE__ */ React.createElement(BadgeCheck, null), /* @__PURE__ */ React.createElement("span", null, "Registrado por: ", /* @__PURE__ */ React.createElement("strong", null, user.nombre || user.email))), /* @__PURE__ */ React.createElement("div", { className: "form-span form-actions" }, /* @__PURE__ */ React.createElement(Button, { type: "submit", icon: Save, loading: saving, disabled: data.historyMigrationRequired }, "Guardar inicio en historial")))
  ), /* @__PURE__ */ React.createElement(
    Panel,
    {
      title: "Historial editable",
      eyebrow: "Listado principal de la base de datos",
      actions: /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: RefreshCcw, onClick: reload }, "Actualizar")
    },
    /* @__PURE__ */ React.createElement(Alert, null, "Las filas marcadas como Sin cerrar esperan su cantidad y su fecha y hora de fin: usa Completar para cargarlas. Al guardar, el tiempo y el puntaje se recalculan. Los registros de otros jefes son de solo lectura."),
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
        onDelete: removeRecord,
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
  onDelete,
  onDraft,
  onSave,
  onCancel,
  onReload,
  onStatus
}) {
  const { page, totalPages, setPage, start, end } = usePagination(rows.length, DEFAULT_PAGE_SIZE);
  if (!rows.length) return /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "Sin registros para los filtros actuales.");
  const visibleRows = rows.slice(start, end);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "editable-history-wrap", role: "region", "aria-label": "Historial editable de tareas", tabIndex: "0" }, /* @__PURE__ */ React.createElement("table", { className: "editable-history-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ID"), /* @__PURE__ */ React.createElement("th", null, "Fecha"), /* @__PURE__ */ React.createElement("th", null, "Encargado"), /* @__PURE__ */ React.createElement("th", null, "Operante"), /* @__PURE__ */ React.createElement("th", null, "Tarea"), /* @__PURE__ */ React.createElement("th", null, "Hora inicio"), /* @__PURE__ */ React.createElement("th", null, "Hora fin"), /* @__PURE__ */ React.createElement("th", null, "Cantidad"), /* @__PURE__ */ React.createElement("th", null, "Tiempo"), /* @__PURE__ */ React.createElement("th", null, "Numero de guia"), /* @__PURE__ */ React.createElement("th", null, "Codigo de lote"), /* @__PURE__ */ React.createElement("th", null, "Hangtag"), /* @__PURE__ */ React.createElement("th", null, "Marca"), /* @__PURE__ */ React.createElement("th", null, "Tienda"), /* @__PURE__ */ React.createElement("th", null, "Detalle"), /* @__PURE__ */ React.createElement("th", null, "Puntaje"), /* @__PURE__ */ React.createElement("th", null, "Modificado"), /* @__PURE__ */ React.createElement("th", { className: "history-actions-heading" }, "Acciones"))), /* @__PURE__ */ React.createElement("tbody", null, visibleRows.map((row) => {
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
        busy: saving,
        readonlyReason: mine && record.revision == null ? "Registro anterior" : editingDisabled && mine ? "Migracion pendiente" : "Solo lectura",
        onEdit: () => onEdit(record),
        onDelete: () => onDelete(record)
      }
    );
  })))), /* @__PURE__ */ React.createElement(TablePager, { page, totalPages, totalRows: rows.length, onChange: setPage }));
}
function HistoryRow({ record, editable, busy, readonlyReason, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const pending = isPendingRecord(record);
  const pendingMark = /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Pendiente");
  return /* @__PURE__ */ React.createElement("tr", { className: pending ? "history-pending-record" : void 0 }, /* @__PURE__ */ React.createElement("td", { className: "history-id-cell" }, "#", record.id, pending ? /* @__PURE__ */ React.createElement("span", { className: "history-pending-badge" }, "Sin cerrar") : null), /* @__PURE__ */ React.createElement("td", null, formatRecordDate(record)), /* @__PURE__ */ React.createElement("td", null, record.encargado_nombre || record.encargado_email || "-"), /* @__PURE__ */ React.createElement("td", null, record.trabajador_nombre || record.trabajador_email || "-"), /* @__PURE__ */ React.createElement("td", null, record.tarea_nombre || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-time-cell" }, formatTimeLima(record.hora_inicio)), /* @__PURE__ */ React.createElement("td", { className: "history-time-cell" }, pending ? pendingMark : formatTimeLima(record.hora_fin)), /* @__PURE__ */ React.createElement("td", { className: "history-number-cell" }, pending ? pendingMark : formatNumber(record.cantidad) || "-"), /* @__PURE__ */ React.createElement("td", null, pending ? pendingMark : formatDuration(record.tiempo_minutos) || "-"), /* @__PURE__ */ React.createElement("td", null, record.codigo_guia || record.numero_guia || "-"), /* @__PURE__ */ React.createElement("td", null, record.lote || "-"), /* @__PURE__ */ React.createElement("td", null, hangtagLabel(record.tipo_etiquetado)), /* @__PURE__ */ React.createElement("td", null, record.marca_nombre || "-"), /* @__PURE__ */ React.createElement("td", null, record.tienda_nombre || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-detail-cell", title: record.detalle || "" }, record.detalle || "-"), /* @__PURE__ */ React.createElement("td", { className: "history-score-cell" }, pending ? pendingMark : formatScore(record.puntaje)), /* @__PURE__ */ React.createElement("td", { className: "history-updated-cell" }, formatUpdatedAt(record)), /* @__PURE__ */ React.createElement("td", { className: "history-actions-cell" }, !editable ? /* @__PURE__ */ React.createElement("span", { className: "history-readonly-badge" }, readonlyReason) : confirming ? /* @__PURE__ */ React.createElement("div", { className: "history-row-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "history-delete-button",
      disabled: busy,
      onClick: () => {
        setConfirming(false);
        onDelete();
      }
    },
    busy ? "Eliminando..." : "Confirmar"
  ), /* @__PURE__ */ React.createElement(
    "button",
    { type: "button", className: "history-cancel-button", disabled: busy, onClick: () => setConfirming(false) },
    "No"
  )) : /* @__PURE__ */ React.createElement("div", { className: "history-row-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    { type: "button", className: "history-edit-button", onClick: onEdit },
    pending ? "Completar" : "Editar"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "history-delete-button",
      title: `Eliminar el registro #${record.id}`,
      onClick: () => setConfirming(true)
    },
    "Eliminar"
  ))));
}
function EditableHistoryRow({ record, draft, tasks, brands, stores, saving, onDraft, onSave, onCancel }) {
  const selectedTask = tasks.find((task) => String(task.id) === String(draft.tarea_id));
  const fields = getTaskFieldFlags(selectedTask);
  const updateDraft = (changes) => onDraft((current) => ({ ...current, ...changes }));
  const start = limaDateTimeToISO(draft.fecha_registro, draft.hora_inicio);
  const finish = limaDateTimeToISO(draft.fecha_fin || draft.fecha_registro, draft.hora_fin);
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
  )), /* @__PURE__ */ React.createElement("td", { className: "history-preview-cell" }, start && finish ? formatDurationFromDates(start, finish) : "Pendiente"), /* @__PURE__ */ React.createElement("td", null, fields.guia ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input",
      "aria-label": `Numero de guia del registro ${record.id}`,
      value: draft.numero_guia || "",
      onChange: (event) => updateDraft({ numero_guia: event.target.value }),
      placeholder: "Opcional"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, fields.lote ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "history-cell-input",
      "aria-label": `Codigo de lote del registro ${record.id}`,
      value: draft.lote,
      onChange: (event) => updateDraft({ lote: event.target.value.toUpperCase() }),
      placeholder: "Opcional"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, fields.hangtag ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "history-cell-input history-select-input",
      "aria-label": `Hangtag del registro ${record.id}`,
      value: draft.tipo_etiquetado || "",
      onChange: (event) => updateDraft({ tipo_etiquetado: event.target.value })
    },
    HANGTAG_OPTIONS.map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, option.label))
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, fields.marca ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "history-cell-input history-select-input",
      "aria-label": `Marca del registro ${record.id}`,
      value: draft.marca_id,
      onChange: (event) => updateDraft({ marca_id: event.target.value })
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecciona"),
    brands.map((brand) => /* @__PURE__ */ React.createElement("option", { key: brand.id, value: String(brand.id) }, brand.nombre))
  ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "No aplica")), /* @__PURE__ */ React.createElement("td", null, fields.tienda ? /* @__PURE__ */ React.createElement(
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
  )), /* @__PURE__ */ React.createElement("td", { className: "history-preview-cell" }, "Se recalcula"), /* @__PURE__ */ React.createElement("td", { className: "history-updated-cell" }, formatUpdatedAt(record)), /* @__PURE__ */ React.createElement("td", { className: "history-actions-cell" }, /* @__PURE__ */ React.createElement("div", { className: "history-row-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "history-save-button", disabled: saving, onClick: onSave }, saving ? "Guardando..." : "Guardar"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "history-cancel-button", disabled: saving, onClick: onCancel }, "Cancelar"))));
}
function PendingActivityRow({ activity, tasks, brands, currentUserId, onReload, onStatus }) {
  const mine = String(activity.encargado_id) === String(currentUserId);
  const task = tasks.find((item) => String(item.id) === String(activity.tarea_id)) || { nombre: activity.tarea_nombre };
  const fields = getTaskFieldFlags(task);
  const usesBrand = fields.marca;
  const usesLote = fields.lote;
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
      <td>{hangtagLabel(activity.tipo_etiquetado)}</td>
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
      <td className="history-updated-cell">{formatUpdatedAt(activity)}</td>
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
  ) : null, mode.requiresHangtag ? /* @__PURE__ */ React.createElement(
    SelectInput,
    {
      label: "Hangtag",
      value: form.tipo_etiquetado,
      onChange: (tipo_etiquetado) => updateForm({ tipo_etiquetado }),
      options: HANGTAG_OPTIONS,
      hint: "Obligatorio para guardar esta tarea."
    }
  ) : null, mode.requiresGuideCode ? /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: "N\xFAmero de gu\xEDa",
      value: form.numero_guia,
      onChange: (numero_guia) => updateForm({ numero_guia }),
      placeholder: "Ej. GUIA-001",
      hint: "Opcional."
    }
  ) : null, mode.requiresLote ? /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: "Codigo de lote",
      value: form.lote,
      onChange: (lote) => updateForm({ lote: lote.toUpperCase() }),
      placeholder: "Ej. A05",
      hint: "Opcional."
    }
  ) : null, mode.requiresStore ? /* @__PURE__ */ React.createElement(
    SelectInput,
    {
      label: "Tienda",
      value: form.tienda_id,
      onChange: (tienda_id) => updateForm({ tienda_id }),
      options: [
        { value: "", label: "Selecciona tienda" },
        ...(stores || []).map((store) => ({ value: String(store.id), label: store.nombre }))
      ],
      hint: "Obligatoria para guardar esta tarea."
    }
  ) : null);
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
  const fields = getTaskFieldFlags(task);
  if (isGroupLeaderTimeTask(task)) {
    return {
      ...mode,
      mode: "tiempo",
      label: "Cantidad y tiempo",
      requiresQuantity: true,
      requiresTime: true,
      // Los campos que pide la tarea salen de sus banderas en Supabase.
      requiresGuideCode: fields.guia,
      requiresLote: fields.lote,
      requiresBrand: fields.marca,
      requiresStore: fields.tienda,
      requiresHangtag: fields.hangtag,
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
function resetTaskMetadata({ tarea_id }) {
  return {
    tarea_id,
    marca_id: "",
    lote: "",
    tienda_id: ""
  };
}
function recordToEditableDraft(record) {
  return {
    trabajador_id: String(record.trabajador_id || ""),
    tarea_id: String(record.tarea_id || ""),
    fecha_registro: recordDateInput(record),
    fecha_fin: recordFinishDateInput(record),
    hora_inicio: timeInputValue(record.hora_inicio),
    hora_fin: timeInputValue(record.hora_fin),
    cantidad: Number(record.cantidad) > 0 ? String(record.cantidad) : "",
    tipo_etiquetado: record.tipo_etiquetado || "",
    numero_guia: record.numero_guia || record.codigo_guia || "",
    marca_id: record.marca_id ? String(record.marca_id) : "",
    lote: record.lote || "",
    tienda_id: record.tienda_id ? String(record.tienda_id) : "",
    detalle: record.detalle || record.observacion || ""
  };
}
function recordDateInput(record) {
  const stored = String(record.fecha_registro || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return limaDatePart(record.hora_inicio) || limaDatePart(record.created_at) || todayLimaISO();
}
// La fecha fin no es una columna propia: vive dentro de hora_fin, que se
// guarda como instante completo.
function recordFinishDateInput(record) {
  return limaDatePart(record.hora_fin) || recordDateInput(record);
}

function formatDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatRecordDate(record) {
  return formatDateValue(recordDateInput(record));
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
// Un registro sigue pendiente mientras no tenga cierre: la cantidad y el
// puntaje se completan al editarlo en el historial.
function isPendingRecord(record) {
  return !record?.hora_fin;
}
function hangtagLabel(value) {
  if (!value) return "-";
  return HANGTAG_OPTIONS.find((option) => option.value === value)?.label || String(value);
}
function formatUpdatedAt(record) {
  const value = record?.updated_at || record?.updatedAt || null;
  if (!value) return "-";
  return formatDateTimeLima(value) || "-";
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
