import { useMemo, useState } from "react";
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
  createGroupLeaderRecord,
  friendlyError,
  loadGroupLeaderContext
} from "../lib/repository";
import { formatDateTimeLima, todayLimaISO } from "../lib/dates";
import {
  getGroupLeaderTaskMode,
  getTaskTitle,
  normalizeMeasurementType,
  normalizeText
} from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import { Alert, Button, DataTable, LoadingBlock, Panel, SelectInput, TextArea, TextInput } from "./ui";

const initialForm = {
  trabajador_id: "",
  tarea_id: "",
  cantidad: "",
  horas: "",
  minutos: "",
  codigo_guia: "",
  lote: "",
  detalle: ""
};

const initialFilters = {
  scope: "all",
  workerId: "",
  taskId: "",
  search: ""
};

const historyColumns = [
  "ID",
  "Fecha",
  "Encargado",
  "Trabajador",
  "Tarea",
  "Cantidad",
  "Tiempo",
  "Codigo guia",
  "Lote",
  "Detalle"
];

export default function GroupLeaderDashboard({ user }) {
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    loadGroupLeaderContext,
    [user?.id],
    { workers: [], tasks: [], leaders: [], records: [] }
  );

  const workers = data.workers || [];
  const tasks = data.tasks || [];
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
    return {
      total: records.length,
      today: records.filter((record) => String(record.fecha_registro || "").slice(0, 10) === today).length,
      mine: records.filter((record) => String(record.encargado_id) === String(user.id)).length,
      lote: records.filter((record) => record.lote).length
    };
  }, [records, user.id]);

  const filteredRecords = useMemo(() => {
    const term = normalizeText(filters.search);

    return records.filter((record) => {
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
  }, [filters, records, user.id]);

  const rows = filteredRecords.map((record) => ({
    id: record.id,
    ID: record.id,
    Fecha: formatDateTimeLima(record.created_at) || record.fecha_registro,
    Encargado: record.encargado_nombre || record.encargado_email,
    Trabajador: record.trabajador_nombre || record.trabajador_email,
    Tarea: record.tarea_nombre,
    Cantidad: formatNumber(record.cantidad),
    Tiempo: formatDuration(record.tiempo_minutos),
    "Codigo guia": record.codigo_guia,
    Lote: record.lote,
    Detalle: record.detalle
  }));

  function updateForm(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function updateFilters(changes) {
    setFilters((current) => ({ ...current, ...changes }));
  }

  function resetForm() {
    setForm(initialForm);
  }

  function validate() {
    if (!selectedWorker) return "Selecciona un trabajador.";
    if (!selectedTask) return "Selecciona una tarea.";
    if (taskMode.requiresQuantity && (!form.cantidad || Number(form.cantidad) <= 0)) {
      return "Ingresa una cantidad mayor a cero.";
    }
    if (taskMode.requiresGuideCode && !form.codigo_guia.trim()) {
      return "Ingresa el codigo de guia.";
    }
    if (taskMode.requiresLote && !form.lote.trim()) {
      return "Ingresa el lote.";
    }
    if (taskMode.requiresTime) {
      const hours = Number(form.horas || 0);
      const minutes = Number(form.minutos || 0);
      const totalMinutes = hours * 60 + minutes;
      if (minutes < 0 || minutes > 59) return "Los minutos deben estar entre 0 y 59.";
      if (totalMinutes <= 0) return "Ingresa el tiempo realizado.";
    }
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

    const totalMinutes = taskMode.requiresTime ? Number(form.horas || 0) * 60 + Number(form.minutos || 0) : null;

    setSaving(true);
    try {
      const payload = {
        encargado_id: user.id,
        trabajador_id: Number(form.trabajador_id),
        tarea_id: Number(form.tarea_id),
        tarea_nombre: getTaskTitle(selectedTask),
        fecha_registro: todayLimaISO(),
        cantidad: taskMode.requiresQuantity ? Number(form.cantidad) : null,
        tiempo_minutos: totalMinutes,
        codigo_guia: taskMode.requiresGuideCode ? form.codigo_guia.trim() : null,
        lote: taskMode.requiresLote ? form.lote.trim().toUpperCase() : null,
        detalle: form.detalle.trim() || (taskMode.completedOnly ? "Realizado" : null)
      };

      await createGroupLeaderRecord(payload);
      setStatus({ type: "success", message: "Registro guardado correctamente." });
      resetForm();
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group-dashboard stack">
      <section className="group-hero">
        <div>
          <p className="eyebrow">Jefe de grupo</p>
          <h2>Registro supervisado</h2>
          <span>{user.nombre || user.email}</span>
        </div>
        <div className="group-metrics" aria-label="Resumen de registros">
          <MetricTile icon={ClipboardCheck} label="Registros" value={metrics.total} />
          <MetricTile icon={Timer} label="Hoy" value={metrics.today} />
          <MetricTile icon={UserRound} label="Mios" value={metrics.mine} />
          <MetricTile icon={Hash} label="Con lote" value={metrics.lote} />
        </div>
      </section>

      <div className="group-layout">
        <Panel
          title="Nuevo registro"
          eyebrow="Captura operativa"
          className="group-form-panel"
          actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
        >
          {loading ? <LoadingBlock /> : null}
          {error ? <Alert type="error">{error}</Alert> : null}
          {status ? <Alert type={status.type}>{status.message}</Alert> : null}
          {!loading && !workers.length ? <Alert>No hay trabajadores operantes activos.</Alert> : null}
          {!loading && !tasks.length ? <Alert>No hay tareas registradas en la base de datos.</Alert> : null}

          <form className="group-form form-grid" onSubmit={handleSubmit}>
            <SelectInput
              label="Trabajador"
              value={form.trabajador_id}
              onChange={(trabajador_id) => updateForm({ trabajador_id })}
              options={[
                { value: "", label: "Selecciona trabajador" },
                ...workers.map((worker) => ({
                  value: String(worker.id),
                  label: `${worker.nombre || worker.email} - ${worker.email || `ID ${worker.id}`}`
                }))
              ]}
            />
            <SelectInput
              label="Tarea"
              value={form.tarea_id}
              onChange={(tarea_id) =>
                setForm({
                  ...initialForm,
                  trabajador_id: form.trabajador_id,
                  tarea_id
                })
              }
              options={[
                { value: "", label: "Selecciona tarea" },
                ...tasks.map((task) => ({
                  value: String(task.id),
                  label: `${getTaskTitle(task) || "Sin nombre"} - ID ${task.id}`
                }))
              ]}
            />

            {selectedTask ? <DynamicGroupFields mode={taskMode} form={form} updateForm={updateForm} /> : null}

            <TextArea
              label="Detalle"
              value={form.detalle}
              onChange={(detalle) => updateForm({ detalle })}
              placeholder={taskMode.completedOnly ? "Realizado" : "Comentario opcional"}
            />

            <div className="form-span form-note group-registrar">
              <BadgeCheck />
              <span>
                Encargado: <strong>{user.nombre || user.email}</strong>
              </span>
            </div>

            <div className="form-span form-actions">
              <Button type="submit" icon={Save} loading={saving}>Guardar registro</Button>
            </div>
          </form>
        </Panel>

        <Panel title="Seleccion actual" eyebrow="Reglas de tarea" className="group-context-panel">
          <div className="selection-list">
            <SelectionLine icon={UsersRound} label="Trabajador" value={selectedWorker?.nombre || selectedWorker?.email || "-"} />
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
            label="Trabajador"
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

function DynamicGroupFields({ mode, form, updateForm }) {
  if (mode.completedOnly) {
    return (
      <div className="form-span">
        <Alert>Esta tarea se guarda como realizado.</Alert>
      </div>
    );
  }

  return (
    <>
      {mode.requiresQuantity ? (
        <TextInput
          label="Cantidad realizada"
          type="number"
          min="1"
          step="1"
          value={form.cantidad}
          onChange={(cantidad) => updateForm({ cantidad })}
        />
      ) : null}
      {mode.requiresTime ? (
        <>
          <TextInput
            label="Horas"
            type="number"
            min="0"
            step="1"
            value={form.horas}
            onChange={(horas) => updateForm({ horas })}
          />
          <TextInput
            label="Minutos"
            type="number"
            min="0"
            max="59"
            step="1"
            value={form.minutos}
            onChange={(minutos) => updateForm({ minutos })}
          />
        </>
      ) : null}
      {mode.requiresGuideCode ? (
        <TextInput
          label="Codigo de guia"
          value={form.codigo_guia}
          onChange={(codigo_guia) => updateForm({ codigo_guia })}
          placeholder="Ej. GUIA-001"
        />
      ) : null}
      {mode.requiresLote ? (
        <TextInput
          label="Lote"
          value={form.lote}
          onChange={(lote) => updateForm({ lote: lote.toUpperCase() })}
          placeholder="Ej. A05"
        />
      ) : null}
    </>
  );
}

function resolveGroupTaskMode(task) {
  if (!task) {
    return {
      mode: "none",
      label: "-",
      requiresQuantity: false,
      requiresGuideCode: false,
      requiresTime: false,
      requiresLote: false,
      completedOnly: false
    };
  }

  const mode = getGroupLeaderTaskMode(getTaskTitle(task));
  const measurementType = normalizeMeasurementType(task?.tipo_medicion);
  const extraName = normalizeText(task?.nombre_dato_extra);

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
  if (mode.requiresLote) pills.push("Lote");
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

function formatDuration(value) {
  const total = Number(value || 0);
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
