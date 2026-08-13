import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
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
  createIncident,
  friendlyError,
  loadIncidentContext,
  loadGroupLeaderContext,
  startGroupLeaderActivity,
  updateGroupLeaderActivity
} from "../lib/repository";
import { formatDateTimeLima, limaDateTimeToISO, nowLimaTimeHHMM, todayLimaISO } from "../lib/dates";
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
import { validateActivityCardMetadata, validateProgressQuantity } from "../lib/operations";
import { Alert, Button, CheckboxInput, DataTable, LoadingBlock, Panel, SelectInput, Tabs, TextArea, TextInput } from "./ui";
import WorkerDashboard from "./WorkerDashboard";

function createInitialForm() {
  return {
    trabajador_id: "",
    tarea_id: "",
    hora_inicio: nowLimaTimeHHMM(),
    usaCodigoGuia: false,
    codigo_guia: "",
    tienda_id: "",
    detalle: ""
  };
}

const initialFilters = {
  scope: "all",
  workerId: "",
  taskId: "",
  search: "",
  order: "desc"
};

function recordSortTime(record) {
  const value = new Date(record.created_at || record.fecha_registro || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

const historyColumns = [
  "ID",
  "Fecha",
  "Encargado",
  "Operante",
  "Tarea",
  "Cantidad",
  "Tiempo",
  "Número de guía",
  "Código de lote",
  "Marca",
  "Tienda",
  "Detalle"
];

export default function GroupLeaderDashboard({ user }) {
  const [workspace, setWorkspace] = useState("Registrar actividad normal");
  const tabs = ["Registrar actividad normal", "Registrar actividad (tiempo)", "Registrar incidencias", "Ranking"];

  return (
    <div className="stack">
      <Tabs
        tabs={tabs}
        active={workspace}
        onChange={setWorkspace}
      />
      {workspace === "Registrar actividad normal" ? (
        <div className="stack">
          <Panel title="Registrar actividad normal" eyebrow="Registro propio">
            <Alert>Los registros de este apartado quedarán asociados a tu propio usuario, no al operante.</Alert>
          </Panel>
          <WorkerDashboard user={user} embedded />
        </div>
      ) : workspace === "Registrar actividad (tiempo)" ? (
        <GroupTimeDashboard user={user} />
      ) : workspace === "Registrar incidencias" ? (
        <IncidentDashboard user={user} />
      ) : (
        <RankingDashboard user={user} />
      )}
    </div>
  );
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
    // data.workers ya llega filtrado a usuarios operantes con activo = true.
    const activeWorkers = new Map(workers.map((worker) => [String(worker.id), worker]));

    const grouped = new Map();
    for (const record of records) {
      if (!taskIds.has(String(record.tarea_id))) continue;
      const worker = activeWorkers.get(String(record.trabajador_id));
      if (!worker) continue;
      const cantidad = Number(record.cantidad || 0);
      const minutos = Number(record.tiempo_minutos || 0);
      if (cantidad <= 0 || minutos <= 0) continue;

      const taskKey = String(record.tarea_id);
      if (!grouped.has(taskKey)) grouped.set(taskKey, new Map());
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

    return tasks
      .map((task) => {
        const workersMap = grouped.get(String(task.id));
        if (!workersMap) return null;
        const ranked = [...workersMap.values()]
          .map((entry) => ({ ...entry, rendimiento: (entry.cantidad / entry.minutos) * 60 }))
          .sort((a, b) => b.rendimiento - a.rendimiento);
        if (!ranked.length) return null;
        return { id: task.id, nombre: getTaskTitle(task) || `Tarea ${task.id}`, ranked };
      })
      .filter(Boolean);
  }, [records, tasks, workers]);

  const visibleRanking = taskId
    ? rankingByTask.filter((item) => String(item.id) === String(taskId))
    : rankingByTask;
  const limit = Number(topLimit);

  return (
    <div className="stack">
      <Panel
        title="Ranking por tarea"
        eyebrow="Rendimiento promedio"
        actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
      >
        {loading ? <LoadingBlock /> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        <Alert>
          El rendimiento se calcula como cantidad total entre tiempo total, expresado por hora. Solo se consideran las
          tareas de jefe de equipo que registran cantidad y tiempo, y únicamente operantes activos.
        </Alert>

        <div className="history-toolbar">
          <SelectInput
            label="Tarea"
            value={taskId}
            onChange={setTaskId}
            options={[
              { value: "", label: "Todas" },
              ...tasks.map((task) => ({ value: String(task.id), label: getTaskTitle(task) || `ID ${task.id}` }))
            ]}
          />
          <SelectInput
            label="Mostrar"
            value={topLimit}
            onChange={setTopLimit}
            options={[
              { value: "3", label: "Top 3" },
              { value: "5", label: "Top 5" },
              { value: "10", label: "Top 10" },
              { value: "0", label: "Todos" }
            ]}
          />
        </div>

        {!loading && !visibleRanking.length ? (
          <Alert>Aún no hay registros con cantidad y tiempo para armar el ranking.</Alert>
        ) : null}
      </Panel>

      {visibleRanking.map((item) => (
        <Panel key={item.id} title={item.nombre} eyebrow="Top operantes">
          <DataTable
            rows={(limit ? item.ranked.slice(0, limit) : item.ranked).map((entry, index) => ({
              "#": index + 1,
              Operante: entry.nombre,
              "Rendimiento (por hora)": formatRate(entry.rendimiento),
              "Cantidad total": formatNumber(entry.cantidad),
              "Tiempo total": formatDuration(entry.minutos),
              Registros: entry.registros
            }))}
            columns={["#", "Operante", "Rendimiento (por hora)", "Cantidad total", "Tiempo total", "Registros"]}
            compact
          />
        </Panel>
      ))}
    </div>
  );
}

const initialIncidentForm = {
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
      setStatus({ type: "error", message: "Ingresa el número de guía." });
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
    "Número de guía": incident.numero_guia,
    "Tipo de error": incident.tipo_error,
    Observación: incident.observacion
  }));

  return (
    <div className="stack">
      <Panel
        title="Registrar incidencia"
        eyebrow="Jefe de equipo"
        actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
      >
        {loading ? <LoadingBlock /> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {status ? <Alert type={status.type}>{status.message}</Alert> : null}
        {!loading && !workers.length ? <Alert>No hay operantes activos.</Alert> : null}
        {!loading && !stores.length ? <Alert>No hay tiendas activas registradas.</Alert> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <SelectInput
            label="Operante"
            value={form.usuario_id}
            onChange={(usuario_id) => updateForm({ usuario_id })}
            options={[
              { value: "", label: "Selecciona un operante" },
              ...workers.map((worker) => ({
                value: String(worker.id),
                label: `${worker.id} - ${worker.nombre || worker.email}`
              }))
            ]}
          />
          <SelectInput
            label="Turno"
            value={form.turno}
            onChange={(turno) => updateForm({ turno })}
            options={["turno regular", "incidencia", "turno extra"]}
          />
          <SelectInput
            label="Tarea"
            value={form.tarea_id}
            onChange={(tarea_id) => updateForm({ tarea_id })}
            options={[
              { value: "", label: "Selecciona una tarea" },
              ...tasks.map((task) => ({ value: String(task.id), label: `${task.id} - ${getTaskTitle(task)}` }))
            ]}
          />
          <SelectInput
            label="Tienda"
            value={form.tienda_id}
            onChange={(tienda_id) => updateForm({ tienda_id })}
            options={[
              { value: "", label: "Selecciona una tienda" },
              ...stores.map((store) => ({ value: String(store.id), label: store.nombre }))
            ]}
          />
          <TextInput
            label="Número de guía"
            value={form.numero_guia}
            onChange={(numero_guia) => updateForm({ numero_guia })}
            placeholder="Ej. GUIA-001"
          />
          <SelectInput
            label="Tipo de error"
            value={form.tipo_error}
            onChange={(tipo_error) => updateForm({ tipo_error })}
            options={["CONTENIDO", "LIBERADO"]}
          />
          <TextArea
            label="Observación"
            value={form.observacion}
            onChange={(observacion) => updateForm({ observacion })}
            placeholder="Detalle opcional"
          />
          <div className="form-span form-actions">
            <Button type="submit" icon={Save} loading={saving}>Guardar incidencia</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Historial de incidencias" eyebrow="Datos registrados">
        <DataTable rows={rows} empty="Todavía no hay incidencias registradas." compact />
      </Panel>
    </div>
  );
}

function GroupTimeDashboard({ user }) {
  const [form, setForm] = useState(createInitialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activityDrafts, setActivityDrafts] = useState({});

  const { data, loading, error, reload } = useAsyncData(
    loadGroupLeaderContext,
    [user?.id],
    { workers: [], tasks: [], brands: [], stores: [], leaders: [], activities: [], records: [] }
  );

  const workers = data.workers || [];
  const tasks = data.tasks || [];
  const brands = data.brands || [];
  const stores = data.stores || [];
  const records = data.records || [];
  const activities = data.activities || [];
  const openActivities = activities.filter((activity) => activity.estado === "EN_CURSO" && String(activity.encargado_id) === String(user.id));
  const completedActivities = activities.filter((activity) => activity.estado === "FINALIZADA");
  const myCompletedActivities = completedActivities.filter((activity) => String(activity.encargado_id) === String(user.id));

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
    const mineActivities = activities.filter((record) => String(record.encargado_id) === String(user.id));
    return {
      total: myCompletedActivities.length,
      today: mineActivities.filter((record) => String(record.fecha_registro || "").slice(0, 10) === today).length,
      mine: openActivities.length,
      adicionales: openActivities.length
    };
  }, [activities, myCompletedActivities.length, openActivities.length, user.id]);

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
          record.detalle
        ].join(" ")
      ).includes(term);
    });

    return filtered.sort((a, b) => {
      const diff = recordSortTime(a) - recordSortTime(b);
      return filters.order === "asc" ? diff : -diff;
    });
  }, [filters, records, user.id]);

  const rows = filteredRecords.map((record) => ({
    id: record.id,
    ID: record.id,
    Fecha: formatDateTimeLima(record.created_at) || record.fecha_registro,
    Encargado: record.encargado_nombre || record.encargado_email,
    Operante: record.trabajador_nombre || record.trabajador_email,
    Tarea: record.tarea_nombre,
    Cantidad: formatNumber(record.cantidad),
    Tiempo: formatDuration(record.tiempo_minutos),
    "Número de guía": record.codigo_guia,
    "Código de lote": record.lote,
    Marca: record.marca_nombre,
    Tienda: record.tienda_nombre,
    Detalle: record.detalle
  }));

  function updateForm(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function updateFilters(changes) {
    setFilters((current) => ({ ...current, ...changes }));
  }

  function resetForm() {
    setForm(createInitialForm());
  }

  function validate() {
    if (!selectedWorker) return "Selecciona un operante.";
    if (!selectedTask) return "Selecciona una tarea.";
    if (!isGroupLeaderTimeTask(selectedTask)) return "Esta tarea no pertenece al registro por tiempo.";
    if (form.usaCodigoGuia && !taskUsesGuideBreakdown(selectedTask)) return "Esta tarea no permite numero de guia.";
    if (form.usaCodigoGuia && !form.codigo_guia.trim()) return "Ingresa el numero de guia.";
    if (taskMode.requiresStore && !form.tienda_id) return "Selecciona una tienda.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora_inicio)) return "Selecciona una hora de inicio valida.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    const validation = validate();
    if (validation) {
      setStatus({ type: "error", message: validation });
      return;
    }
    setSaving(true);
    try {
      await startGroupLeaderActivity({
        trabajador_id: Number(form.trabajador_id),
        tarea_id: Number(form.tarea_id),
        hora_inicio: new Date(`${todayLimaISO()}T${form.hora_inicio}:00-05:00`).toISOString(),
        codigo_guia: taskUsesGuideBreakdown(selectedTask) && form.usaCodigoGuia ? form.codigo_guia.trim() : null,
        tienda_id: taskMode.requiresStore ? Number(form.tienda_id) : null,
        detalle: form.detalle.trim() || null
      });
      setStatus({ type: "success", message: "Actividad iniciada. Registra los avances desde la tarjeta creada abajo." });
      resetForm();
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }

  function draftFor(activity) {
    return activityDrafts[activity.id] || {
      cantidad: String(activity.cantidad ?? 0),
      marca_id: activity.marca_id ? String(activity.marca_id) : "",
      usaLote: Boolean(activity.lote),
      lote: activity.lote || "",
      fecha_fin: todayLimaISO(),
      hora_fin: nowLimaTimeHHMM(),
      expanded: true,
      saving: false
    };
  }

  function updateActivityDraft(activity, changes) {
    setActivityDrafts((current) => ({ ...current, [activity.id]: { ...draftFor(activity), ...(current[activity.id] || {}), ...changes } }));
  }

  async function saveActivityProgress(activity, action = "progress") {
    const draft = draftFor(activity);
    const task = tasks.find((item) => String(item.id) === String(activity.tarea_id)) || { nombre: activity.tarea_nombre };
    const usesBrand = taskUsesBrandsByDefault(task);
    const usesLote = taskUsesLote(task);
    const finalize = action === "finish";
    const metadataOnly = action === "metadata";
    if (!metadataOnly) {
      const validation = validateProgressQuantity(activity.cantidad, draft.cantidad);
      if (validation) {
        setStatus({ type: "error", message: validation });
        return;
      }
    }
    const metadataValidation = validateActivityCardMetadata({
      requiresBrand: usesBrand,
      allowsLote: usesLote,
      marcaId: draft.marca_id,
      useLote: draft.usaLote,
      lote: draft.lote,
      requireBrand: finalize
    });
    if (metadataValidation) {
      setStatus({ type: "error", message: metadataValidation });
      return;
    }
    if (!metadataOnly && !finalize && Number(draft.cantidad) === Number(activity.cantidad || 0)) {
      setStatus({ type: "error", message: "Ingresa una cantidad mayor para registrar un nuevo avance." });
      return;
    }
    const finishDateTime = finalize ? limaDateTimeToISO(draft.fecha_fin, draft.hora_fin) : "";
    if (finalize && !finishDateTime) {
      setStatus({ type: "error", message: "Selecciona una fecha y hora fin validas." });
      return;
    }
    updateActivityDraft(activity, { saving: true });
    setStatus(null);
    try {
      await updateGroupLeaderActivity(activity.id, {
        cantidad: metadataOnly ? Number(activity.cantidad || 0) : Number(draft.cantidad),
        ...(usesBrand ? { marca_id: draft.marca_id ? Number(draft.marca_id) : null } : {}),
        ...(usesLote ? { lote: draft.usaLote ? String(draft.lote || "").trim().toUpperCase() : null } : {}),
        ...(metadataOnly ? { actualizar_datos: true } : {}),
        ...(finalize ? { finalizar: true, hora_fin: finishDateTime } : {})
      });
      setStatus({
        type: "success",
        message: finalize
          ? "Actividad finalizada y puntaje asignado."
          : metadataOnly
            ? "Marca y lote guardados en la tarjeta."
            : "Avance guardado en el historial."
      });
      if (metadataOnly) {
        updateActivityDraft(activity, {
          marca_id: draft.marca_id,
          usaLote: draft.usaLote,
          lote: draft.usaLote ? String(draft.lote || "").trim().toUpperCase() : "",
          saving: false
        });
      } else {
        setActivityDrafts((current) => { const next = { ...current }; delete next[activity.id]; return next; });
      }
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
      updateActivityDraft(activity, { saving: false });
    }
  }

  async function cancelActivity(activity) {
    if (!window.confirm(`¿Cancelar la actividad de ${activity.trabajador_nombre}? Se eliminará su historial de avances y esta acción no se puede deshacer.`)) return;
    setStatus(null);
    updateActivityDraft(activity, { saving: true });
    try {
      await cancelGroupLeaderActivity(activity.id);
      setStatus({ type: "success", message: "Actividad cancelada. El operante queda disponible para una nueva actividad." });
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
      updateActivityDraft(activity, { saving: false });
    }
  }
  return (
    <div className="group-dashboard stack">
      <section className="group-hero">
        <div>
          <p className="eyebrow">{user.rol || "Jefe de equipo"}</p>
          <h2>Registrar actividad por tiempo</h2>
          <span>{user.nombre || user.email}</span>
        </div>
        <div className="group-metrics" aria-label="Resumen de registros">
          <MetricTile icon={ClipboardCheck} label="Finalizadas" value={metrics.total} />
          <MetricTile icon={Timer} label="Actividades hoy" value={metrics.today} />
          <MetricTile icon={UserRound} label="Abiertas por mí" value={metrics.mine} />
          <MetricTile icon={Hash} label="En curso" value={metrics.adicionales} />
        </div>
      </section>

      <div className="group-layout">
        <Panel
          title="Iniciar actividad"
          eyebrow="Seguimiento en tiempo real"
          className="group-form-panel"
          actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
        >
          {loading ? <LoadingBlock /> : null}
          {error ? <Alert type="error">{error}</Alert> : null}
          {status ? <Alert type={status.type}>{status.message}</Alert> : null}
          {data.operationsMigrationRequired ? <Alert type="error">Falta aplicar la migración SQL 026 en Supabase para activar las tarjetas en tiempo real.</Alert> : null}
          <Alert>
            Selecciona operante, tarea y hora de inicio. Para Etiquetado, la marca y el lote se completan después dentro de la tarjeta.
          </Alert>
          {!loading && !workers.length ? <Alert>No hay trabajadores operantes activos.</Alert> : null}
          {!loading && !tasks.length ? <Alert>No hay tareas registradas en la base de datos.</Alert> : null}

          <form className="group-form form-grid" onSubmit={handleSubmit}>
            <SelectInput
              label="Operante"
              value={form.trabajador_id}
              onChange={(trabajador_id) => updateForm({ trabajador_id })}
              options={[
                { value: "", label: "Selecciona operante" },
                ...workers.map((worker) => ({
                  value: String(worker.id),
                  label: `${worker.nombre || worker.email} - ${worker.email || `ID ${worker.id}`}`
                }))
              ]}
            />
            <TextInput
              label="Hora de inicio"
              type="time"
              value={form.hora_inicio}
              onChange={(hora_inicio) => updateForm({ hora_inicio })}
              max={nowLimaTimeHHMM()}
            />
            <SelectInput
              label="Tarea"
              value={form.tarea_id}
              onChange={(tarea_id) =>
                setForm({
                  ...createInitialForm(),
                  hora_inicio: form.hora_inicio,
                  trabajador_id: form.trabajador_id,
                  tarea_id
                })
              }
              options={[
                { value: "", label: "Selecciona tarea" },
                ...tasks.map((task) => ({
                  value: String(task.id),
                  label: getTaskTitle(task) || "Sin nombre"
                }))
              ]}
            />

            {selectedTask ? (
              <DynamicGroupFields
                mode={taskMode}
                task={selectedTask}
                form={form}
                updateForm={updateForm}
                stores={stores}
              />
            ) : null}

            <TextArea
              label="Detalle"
              value={form.detalle}
              onChange={(detalle) => updateForm({ detalle })}
              placeholder={taskMode.completedOnly ? "Realizado" : "Comentario opcional"}
            />

            <div className="form-span form-note group-registrar">
              <BadgeCheck />
              <span>
                Registrado por: <strong>{user.nombre || user.email}</strong>
              </span>
            </div>

            <div className="form-span form-actions">
              <Button type="submit" icon={Save} loading={saving} disabled={data.operationsMigrationRequired}>Iniciar actividad</Button>
            </div>
          </form>
        </Panel>

        <Panel title="Seleccion actual" eyebrow="Reglas de tarea" className="group-context-panel">
          <div className="selection-list">
            <SelectionLine icon={UsersRound} label="Operante" value={selectedWorker?.nombre || selectedWorker?.email || "-"} />
            <SelectionLine icon={ClipboardCheck} label="Tarea" value={getTaskTitle(selectedTask) || "-"} />
            <SelectionLine icon={Filter} label="Tipo" value={taskMode.label} />
          </div>
          <div className="mode-pills">
            {modePills(taskMode).map((pill) => (
              <span key={pill}>{pill}</span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Actividades en curso"
        eyebrow="Actualización de cantidad en tiempo real"
        actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
      >
        {!loading && !openActivities.length ? <Alert>No hay actividades abiertas. Inicia una para crear su tarjeta.</Alert> : null}
        <div className="activity-session-grid">
          {openActivities.map((activity) => (
            <LiveActivityCard
              key={activity.id}
              activity={activity}
              task={tasks.find((item) => String(item.id) === String(activity.tarea_id)) || { nombre: activity.tarea_nombre }}
              brands={brands}
              draft={draftFor(activity)}
              onDraft={(changes) => updateActivityDraft(activity, changes)}
              onSaveMetadata={() => saveActivityProgress(activity, "metadata")}
              onSave={() => saveActivityProgress(activity, "progress")}
              onFinish={() => saveActivityProgress(activity, "finish")}
              onCancel={() => cancelActivity(activity)}
            />
          ))}
        </div>
      </Panel>

      {myCompletedActivities.length ? (
        <Panel title="Actividades finalizadas" eyebrow="Puntaje ya asignado">
          <div className="activity-session-grid activity-completed-list">
            {myCompletedActivities.slice(0, 12).map((activity) => <CompletedActivityCard key={activity.id} activity={activity} />)}
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Historial registrado"
        eyebrow="Datos de la base"
        actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
      >
        <div className="history-toolbar">
          <div className="scope-switch" aria-label="Alcance de registros">
            <button
              type="button"
              className={filters.scope === "all" ? "active" : ""}
              onClick={() => updateFilters({ scope: "all" })}
            >
              Todos
            </button>
            <button
              type="button"
              className={filters.scope === "mine" ? "active" : ""}
              onClick={() => updateFilters({ scope: "mine" })}
            >
              Mios
            </button>
          </div>
          <SelectInput
            label="Operante"
            value={filters.workerId}
            onChange={(workerId) => updateFilters({ workerId })}
            options={[
              { value: "", label: "Todos" },
              ...workers.map((worker) => ({
                value: String(worker.id),
                label: worker.nombre || worker.email || `ID ${worker.id}`
              }))
            ]}
          />
          <SelectInput
            label="Tarea"
            value={filters.taskId}
            onChange={(taskId) => updateFilters({ taskId })}
            options={[
              { value: "", label: "Todas" },
              ...tasks.map((task) => ({
                value: String(task.id),
                label: getTaskTitle(task) || `ID ${task.id}`
              }))
            ]}
          />
          <SelectInput
            label="Ordenar por fecha"
            value={filters.order}
            onChange={(order) => updateFilters({ order })}
            options={[
              { value: "desc", label: "Más reciente primero" },
              { value: "asc", label: "Más antigua primero" }
            ]}
          />
          <label className="field search-field">
            <span className="field-label">Buscar</span>
            <span className="search-input">
              <Search />
              <input
                className="input"
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Nombre, tarea, guia, lote"
              />
            </span>
          </label>
        </div>

        <DataTable rows={rows} columns={historyColumns} empty="Sin registros para los filtros actuales." compact />
      </Panel>
    </div>
  );
}

function DynamicGroupFields({ mode, task, form, updateForm, stores }) {
  if (mode.completedOnly) {
    return (
      <div className="form-span">
        <Alert>Esta tarea se guarda como realizado.</Alert>
      </div>
    );
  }

  return (
    <>
      {mode.requiresStore ? (
        <SelectInput
          label="Tienda"
          value={form.tienda_id}
          onChange={(tienda_id) => updateForm({ tienda_id })}
          options={[
            { value: "", label: "Selecciona tienda" },
            ...(stores || []).map((store) => ({ value: String(store.id), label: store.nombre }))
          ]}
          hint="Igual que en el registro del operante para esta tarea."
        />
      ) : null}
      {taskUsesGuideBreakdown(task) ? (
        <>
          <CheckboxInput
            label="Añadir número de guía"
            checked={form.usaCodigoGuia}
            onChange={(usaCodigoGuia) => updateForm({ usaCodigoGuia, codigo_guia: usaCodigoGuia ? form.codigo_guia : "" })}
            hint="Igual que en el registro del operante para esta tarea."
          />
          {form.usaCodigoGuia ? (
            <TextInput
              label="Número de guía"
              value={form.codigo_guia}
              onChange={(codigo_guia) => updateForm({ codigo_guia })}
              placeholder="Ej. GUIA-001"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function LiveActivityCard({ activity, task, brands, draft, onDraft, onSaveMetadata, onSave, onFinish, onCancel }) {
  const expanded = draft.expanded !== false;
  const usesBrand = taskUsesBrandsByDefault(task);
  const usesLote = taskUsesLote(task);
  return (
    <article className="activity-session-card open">
      <button type="button" className="activity-session-summary" aria-expanded={expanded} onClick={() => onDraft({ expanded: !expanded })}>
        <span className="activity-session-status"><i /> En curso</span>
        <span className="activity-session-title">
          <strong>{activity.trabajador_nombre}</strong>
          <small>{activity.tarea_nombre}</small>
        </span>
        <span className="activity-session-start">Inicio {formatTimeLima(activity.hora_inicio)}</span>
        <ChevronDown className={expanded ? "expanded" : ""} />
      </button>
      {expanded ? (
        <div className="activity-session-body">
          <div className="activity-session-stats">
            <div><span>Cantidad actual</span><strong>{formatNumber(activity.cantidad || 0)}</strong></div>
            <div><span>Duración</span><strong>{formatDurationFromDates(activity.hora_inicio, new Date().toISOString())}</strong></div>
            <div><span>Puntaje</span><strong>Pendiente</strong></div>
          </div>
          {usesBrand || usesLote ? (
            <section className="activity-metadata-panel" aria-label="Datos de la actividad">
              <div className="activity-metadata-heading">
                <div>
                  <h3>Datos de la actividad</h3>
                  <p>Completa la marca y, si corresponde, el lote después de iniciar la tarjeta. La marca será obligatoria al finalizar.</p>
                </div>
                {!draft.marca_id ? <span className="activity-metadata-warning">Marca pendiente</span> : <span className="activity-metadata-ready">Datos listos</span>}
              </div>
              <div className="activity-metadata-grid">
                {usesBrand ? (
                  <SelectInput
                    label="Marca"
                    value={draft.marca_id}
                    onChange={(marca_id) => onDraft({ marca_id })}
                    options={[
                      { value: "", label: "Selecciona marca" },
                      ...(brands || []).map((brand) => ({ value: String(brand.id), label: brand.nombre }))
                    ]}
                    hint="Obligatoria antes de finalizar la actividad."
                  />
                ) : null}
                {usesLote ? (
                  <CheckboxInput
                    label="Añadir código de lote"
                    checked={draft.usaLote}
                    onChange={(usaLote) => onDraft({ usaLote, lote: usaLote ? draft.lote : "" })}
                    hint="El lote es opcional para Etiquetado."
                  />
                ) : null}
                {usesLote && draft.usaLote ? (
                  <TextInput
                    label="Código de lote"
                    value={draft.lote}
                    onChange={(lote) => onDraft({ lote: lote.toUpperCase() })}
                    placeholder="Ej. A05"
                  />
                ) : null}
              </div>
              <div className="activity-metadata-actions">
                <Button type="button" variant="secondary" icon={Save} loading={draft.saving} onClick={onSaveMetadata}>Guardar marca y lote</Button>
              </div>
            </section>
          ) : null}
          <div className="activity-progress-form">
            <TextInput
              label="Cantidad acumulada"
              type="number"
              min={activity.cantidad || 0}
              step="1"
              value={draft.cantidad}
              onChange={(cantidad) => onDraft({ cantidad })}
              hint="Escribe el total alcanzado hasta este momento."
            />
            <TextInput
              label="Fecha fin"
              type="date"
              min={String(activity.fecha_registro || "").slice(0, 10)}
              max={todayLimaISO()}
              value={draft.fecha_fin}
              onChange={(fecha_fin) => onDraft({ fecha_fin })}
              hint="Permite finalizar actividades que cruzaron la medianoche."
            />
            <TextInput
              label="Hora fin"
              type="time"
              value={draft.hora_fin}
              onChange={(hora_fin) => onDraft({ hora_fin })}
              hint="Solo se usa al finalizar la actividad."
            />
          </div>
          <div className="activity-session-actions">
            <Button type="button" variant="danger" loading={draft.saving} onClick={onCancel}>Cancelar actividad</Button>
            <Button type="button" variant="secondary" icon={Save} loading={draft.saving} onClick={onSave}>Guardar avance</Button>
            <Button type="button" icon={BadgeCheck} loading={draft.saving} onClick={onFinish}>Finalizar actividad</Button>
          </div>
          <ActivityHistory activity={activity} />
        </div>
      ) : null}
    </article>
  );
}

function CompletedActivityCard({ activity }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="activity-session-card completed">
      <button type="button" className="activity-session-summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="activity-session-status completed"><BadgeCheck /> Finalizada</span>
        <span className="activity-session-title"><strong>{activity.trabajador_nombre}</strong><small>{activity.tarea_nombre}</small></span>
        <span className="activity-session-start">{formatNumber(activity.cantidad)} · {activity.puntaje} pts</span>
        <ChevronDown className={expanded ? "expanded" : ""} />
      </button>
      {expanded ? (
        <div className="activity-session-body">
          <div className="activity-session-stats">
            <div><span>Cantidad final</span><strong>{formatNumber(activity.cantidad)}</strong></div>
            <div><span>Duración</span><strong>{formatDurationFromDates(activity.hora_inicio, activity.hora_fin)}</strong></div>
            <div><span>Puntaje</span><strong>{activity.puntaje} pts</strong></div>
          </div>
          {activity.marca_nombre || activity.lote ? (
            <div className="activity-completed-metadata">
              {activity.marca_nombre ? <span>Marca <strong>{activity.marca_nombre}</strong></span> : null}
              {activity.lote ? <span>Lote <strong>{activity.lote}</strong></span> : null}
            </div>
          ) : null}
          <ActivityHistory activity={activity} />
        </div>
      ) : null}
    </article>
  );
}

function ActivityHistory({ activity }) {
  return (
    <div className="activity-session-history">
      <h3>Historial de avances</h3>
      <ol>
        {(activity.history || []).map((entry, index) => {
          const previous = Number(activity.history?.[index - 1]?.cantidad || 0);
          const delta = Number(entry.cantidad || 0) - previous;
          return (
            <li key={entry.id}>
              <span>{formatTimeLima(entry.created_at)}</span>
              <strong>{formatNumber(entry.cantidad)} acumulado</strong>
              <small>{entry.tipo === "INICIO" ? "Actividad iniciada" : entry.tipo === "FINALIZACION" ? `Finalizada · ${entry.puntaje || activity.puntaje || 0} pts` : `+${formatNumber(delta)} desde el avance anterior`}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
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

function MetricTile({ icon: Icon, label, value }) {
  return (
    <div className="group-metric">
      <Icon />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SelectionLine({ icon: Icon, label, value }) {
  return (
    <div className="selection-line">
      <Icon />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "";
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
  return formatDuration(Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)));
}
