import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, ChevronDown, Clock3, Minus, Plus, RefreshCcw, Save, Timer, X } from "lucide-react";
import {
  createWorkerActivityLog,
  friendlyError,
  getTasksForUser,
  listBrands,
  listTiendas,
  listTaskScoreRanges,
  listTasks,
  listWorkerActivityLogs,
  loadWorkerLiveProgress
} from "../lib/repository";
import { formatDateTimeLima, todayLimaISO } from "../lib/dates";
import {
  calculatePoints,
  displayShiftFromQuantity,
  FULL_SHIFT,
  getActivityCaptureMode,
  getTaskFieldFlags,
  getTaskTitle,
  isGroupLeaderTimeTask,
  isFullShift,
  NO_TASK_OPTION,
  normalizeMeasurementType,
  SIMPLE_SHIFT
} from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import {
  Alert,
  Button,
  CheckboxInput,
  DataTable,
  IconButton,
  LoadingBlock,
  Panel,
  SelectInput,
  Tabs,
  TextArea,
  TextInput
} from "./ui";
import { BrandDistribution, brandTotal, emptyBrandShare } from "./BrandDistribution";
import { emptyGuideShare, GuideDistribution, guideTotal } from "./GuideDistribution";

export const HANGTAG_OPTIONS = [
  { value: "", label: "Selecciona" },
  { value: "CON_HANGTAG", label: "Con hangtag" },
  { value: "SIN_HANGTAG", label: "Sin hangtag" }
];

function recordCaptureType(task) {
  const dbType = normalizeMeasurementType(task?.tipo_medicion);
  const [fallbackType] = getActivityCaptureMode(getTaskTitle(task));
  return isGroupLeaderTimeTask(task)
    ? "tiempo"
    : task?.tipo_medicion ? dbType : normalizeMeasurementType(fallbackType);
}

// Todas las banderas de la tarea se respetan tal cual. Lo unico que cambia
// segun el tipo de tarea es COMO se captura marca y guia: repartiendo la
// cantidad total cuando la tarea se mide por cantidad, o como un solo valor
// cuando se registra por turno o por cumplimiento.
function recordFieldFlags(task) {
  return getTaskFieldFlags(task);
}

function taskSplitsQuantity(task) {
  return ["cantidad", "tiempo"].includes(recordCaptureType(task));
}

function emptyRecord() {
  return {
    taskKey: "",
    cantidad: "",
    usaMarcas: false,
    marcaId: "",
    numeroGuia: "",
    lote: "",
    tipoEtiquetado: "",
    tiendaId: "",
    usaGuias: false,
    guias: [emptyGuideShare()],
    marcas: [emptyBrandShare()],
    cumplimiento: true,
    turno: SIMPLE_SHIFT,
    detalle: ""
  };
}

export default function WorkerDashboard({ user, embedded = false }) {
  const [tab, setTab] = useState("Registrar actividad");
  const tabs = embedded ? ["Registrar actividad", "Historial"] : ["Registrar actividad", "Progreso en vivo", "Historial"];

  return (
    <div className={embedded ? "stack embedded-worker" : "stack"}>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "Registrar actividad" ? <RegisterActivity user={user} /> : null}
      {tab === "Progreso en vivo" ? <WorkerLiveProgress user={user} /> : null}
      {tab === "Historial" ? <WorkerHistory user={user} /> : null}
    </div>
  );
}

function RegisterActivity({ user }) {
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [tasks, brands, stores] = await Promise.all([getTasksForUser(user), listBrands(), listTiendas()]);
      return { tasks, brands, stores: stores.filter((store) => String(store.activo ?? true) !== "false") };
    },
    [user?.id],
    { tasks: [], brands: [], stores: [] }
  );
  const tasks = data.tasks || [];
  const brands = data.brands || [];
  const stores = data.stores || [];
  const [records, setRecords] = useState([emptyRecord()]);
  const [status, setStatus] = useState(null);
  const [successDialog, setSuccessDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  const taskMap = useMemo(() => {
    return Object.fromEntries(
      tasks
        .slice()
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
        .map((task) => [`${task.id} - ${getTaskTitle(task) || "Sin titulo"}`, task])
    );
  }, [tasks]);

  const taskKeys = Object.keys(taskMap);

  function updateRecord(index, changes) {
    setRecords((current) =>
      current.map((record, recordIndex) => (recordIndex === index ? { ...record, ...changes } : record))
    );
  }

  function handleTaskChange(index, taskKey) {
    const task = taskMap[taskKey];
    setRecords((current) =>
      current.map((record, recordIndex) =>
        recordIndex === index
          ? {
              ...emptyRecord(),
              taskKey,
              usaMarcas: recordFieldFlags(task).marca && taskSplitsQuantity(task),
              usaGuias: recordFieldFlags(task).guia && taskSplitsQuantity(task)
            }
          : record
      )
    );
  }

  function addRecord() {
    if (records.length >= taskKeys.length) return;
    setRecords([...records, emptyRecord()]);
  }

  function removeRecord() {
    if (records.length <= 1) return;
    setRecords(records.slice(0, -1));
  }

  function removeRecordAt(index) {
    setRecords((current) => {
      if (current.length === 1) return [emptyRecord()];
      return current.filter((_, recordIndex) => recordIndex !== index);
    });
    setStatus(null);
  }

  function selectedTaskFor(record) {
    return taskMap[record.taskKey] || null;
  }

  function recordPayloadShape(record) {
    const task = selectedTaskFor(record);
    const title = getTaskTitle(task);
    const [, fallbackUnit] = getActivityCaptureMode(title);
    const type = recordCaptureType(task);
    const unit = task?.unidad_medida || task?.unidad_base || task?.unidad || fallbackUnit;
    const flags = recordFieldFlags(task);
    const splitsQuantity = taskSplitsQuantity(task);
    const marcas = flags.marca && splitsQuantity && record.usaMarcas
      ? record.marcas.map((item) => ({ marca_id: Number(item.marca_id), cantidad: Number(item.cantidad) }))
      : [];
    const guias = flags.guia && splitsQuantity && record.usaGuias
      ? record.guias.map((item) => ({ numero_guia: String(item.numero_guia || "").trim(), cantidad: Number(item.cantidad) }))
      : [];
    // Sin cantidad que repartir se guarda un unico valor por registro.
    const marcaId = flags.marca && !splitsQuantity && record.marcaId ? Number(record.marcaId) : null;
    const numeroGuia = flags.guia && !splitsQuantity ? String(record.numeroGuia || "").trim() || null : null;
    const tiendaId = flags.tienda && record.tiendaId ? Number(record.tiendaId) : null;
    const lote = flags.lote ? String(record.lote || "").trim().toUpperCase() || null : null;
    const tipoEtiquetado = flags.hangtag ? record.tipoEtiquetado || null : null;

    let cantidad = null;
    let cantidadPuntaje = null;
    let tiempoMinutos = null;
    let cumplimiento = record.cumplimiento;
    let turno = null;

    // Con marcas o guias la cantidad total es la suma de sus filas: no se pide
    // aparte para no tener que cuadrar dos numeros a mano.
    const splitTotal = marcas.length ? brandTotal(marcas) : guias.length ? guideTotal(guias) : null;
    if (type === "cantidad") {
      cantidad = splitTotal ?? (record.cantidad === "" ? null : Number(record.cantidad));
      cumplimiento = true;
    }
    if (type === "tiempo") {
      cantidad = splitTotal ?? (record.cantidad === "" ? null : Number(record.cantidad));
      tiempoMinutos = null;
      cumplimiento = true;
    }
    if (type === "fijo") {
      cumplimiento = true;
    }
    if (type === "turno") {
      turno = record.turno;
      cantidadPuntaje = record.turno === FULL_SHIFT ? 2 : 1;
      cumplimiento = true;
    }

    return {
      task,
      title,
      type,
      unit,
      cantidad,
      cantidadPuntaje,
      tiempoMinutos,
      cumplimiento,
      turno,
      marcas,
      guias,
      flags,
      splitsQuantity,
      marcaId,
      numeroGuia,
      usesStore: flags.tienda,
      tiendaId,
      lote,
      tipoEtiquetado
    };
  }

  function validateRecords() {
    if (!records.length || records.some((record) => !record.taskKey || record.taskKey === NO_TASK_OPTION)) {
      return "Debe seleccionar una tarea en cada registro.";
    }

    const seen = new Set();
    for (const record of records) {
      if (seen.has(record.taskKey)) return "No puedes repetir la misma tarea en el mismo envio.";
      seen.add(record.taskKey);

      const shape = recordPayloadShape(record);
      if (shape.usesStore && !stores.some((store) => String(store.id) === String(record.tiendaId))) {
        return `Selecciona una tienda valida para ${shape.title}.`;
      }
      if (shape.guias.length) {
        if (shape.guias.some((item) => !item.numero_guia || !Number.isFinite(item.cantidad) || item.cantidad <= 0)) {
          return `Completa cada número de guía y su cantidad para ${shape.title}.`;
        }
        const normalizedGuides = shape.guias.map((item) => item.numero_guia.toLowerCase());
        if (new Set(normalizedGuides).size !== normalizedGuides.length) {
          return `No puedes repetir un número de guía en ${shape.title}.`;
        }
      }
      if (shape.flags.hangtag && !shape.tipoEtiquetado) {
        return `Indica si ${shape.title} va con hangtag o sin hangtag.`;
      }
      if (shape.flags.marca && shape.splitsQuantity && record.usaMarcas) {
        if (!record.marcas.length || record.marcas.some((item) => !item.marca_id || Number(item.cantidad) <= 0)) {
          return `Completa cada marca y su cantidad para ${shape.title}.`;
        }
        if (new Set(record.marcas.map((item) => String(item.marca_id))).size !== record.marcas.length) {
          return `No puedes repetir una marca en ${shape.title}.`;
        }
      }
      if (shape.type === "cantidad" && !shape.marcas.length && !shape.guias.length && (record.cantidad === "" || Number(record.cantidad) < 0)) {
        return `Ingresa una cantidad valida para ${shape.title}.`;
      }
      if (shape.type === "tiempo" && !shape.marcas.length && !shape.guias.length && (record.cantidad === "" || Number(record.cantidad) <= 0)) {
        return `Ingresa la cantidad realizada para ${shape.title}.`;
      }
    }

    if (records.some((record) => isFullShift(record.turno)) && records.length > 1) {
      return "Si seleccionas turno completo, no puedes registrar otras actividades el mismo dia.";
    }

    return "";
  }

  async function handleSave() {
    setStatus(null);
    setSuccessDialog(null);
    const validation = validateRecords();
    if (validation) {
      setStatus({ type: "error", message: validation });
      return;
    }

    setSaving(true);
    try {
      const today = todayLimaISO();
      const existingLogs = await listWorkerActivityLogs(user.id);
      const logsToday = existingLogs.filter((log) => String(log.fecha_registro) === today);
      const hasFullShiftInBatch = records.some((record) => isFullShift(record.turno));

      if (logsToday.length) {
        if (hasFullShiftInBatch) {
          setStatus({ type: "error", message: "No puedes registrar turno completo porque ya tienes actividades hoy." });
          return;
        }
        if (logsToday.some((log) => isFullShift(log.turno))) {
          setStatus({ type: "error", message: "Ya registraste turno completo hoy. No puedes anadir mas actividades." });
          return;
        }
      }

      let saved = 0;
      let totalPoints = 0;
      const failures = [];

      for (const record of records) {
        try {
          const shape = recordPayloadShape(record);
          const taskForPoints = { ...shape.task };
          if (shape.type === "cantidad") {
            taskForPoints.rangos_puntaje = await listTaskScoreRanges(shape.task.id);
          }
          const points = calculatePoints(
            taskForPoints,
            shape.cantidadPuntaje ?? shape.cantidad,
            shape.tiempoMinutos,
            shape.cumplimiento
          );
          const activityPayload = {
            trabajador_id: user.id,
            usuario_id: user.id,
            tarea_id: shape.task.id,
            actividad_nombre: shape.title,
            fecha_registro: today,
            cantidad: shape.cantidad,
            tipo_medicion: shape.type,
            cumplimiento: shape.cumplimiento,
            detalle: record.detalle.trim() || null,
            turno: shape.turno,
            tienda_id: shape.tiendaId,
            lote: shape.lote,
            tipo_etiquetado: shape.tipoEtiquetado,
            marca_id: shape.marcaId,
            numero_guia: shape.numeroGuia,
            puntaje: points,
            marcas: shape.marcas,
            guias: shape.guias
          };
          if (shape.tiempoMinutos !== null && shape.tiempoMinutos !== undefined) {
            activityPayload.tiempo_minutos = shape.tiempoMinutos;
          }
          await createWorkerActivityLog(activityPayload);
          saved += 1;
          totalPoints += Number(points || 0);
        } catch (err) {
          failures.push({ tarea: selectedTaskFor(record)?.titulo || record.taskKey, error: friendlyError(err) });
        }
      }

      if (failures.length) {
        setStatus({
          type: "error",
          message: `${failures.length} registros fallaron. ${failures[0]?.error || "Revisa la base de datos."}`
        });
        return;
      }

      setRecords([emptyRecord()]);
      setSuccessDialog({ saved, totalPoints });
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Registrar lo realizado"
      eyebrow="Operaciones"
      actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar tareas</Button>}
    >
      {loading ? <LoadingBlock /> : null}
      {error ? <Alert type="error">{error}</Alert> : null}
      {status ? <Alert type={status.type}>{status.message}</Alert> : null}
      {!loading && !tasks.length ? <Alert>No tienes tareas asignadas para registrar actividades.</Alert> : null}

      <div className="record-toolbar">
        <Button variant="secondary" icon={Plus} onClick={addRecord} disabled={records.length >= taskKeys.length}>
          Agregar tarea
        </Button>
        <Button variant="ghost" icon={Minus} onClick={removeRecord} disabled={records.length <= 1}>
          Quitar tarea
        </Button>
        <span>Registros a cargar: {records.length}</span>
      </div>

      <div className="records-list">
        {records.map((record, index) => {
          const selectedKeys = records.map((item, itemIndex) => (itemIndex === index ? null : item.taskKey)).filter(Boolean);
          const availableOptions = taskKeys.filter((key) => !selectedKeys.includes(key));
          const selectedTask = selectedTaskFor(record);
          return (
            <div className="record-card" key={index}>
              <div className="record-card-header">
                <div className="record-title">Registro {index + 1}</div>
                <IconButton
                  type="button"
                  className="record-remove-btn"
                  label={`Quitar registro ${index + 1}`}
                  icon={X}
                  onClick={() => removeRecordAt(index)}
                />
              </div>
              <SelectInput
                label="Tarea realizada"
                value={record.taskKey || (index === 0 ? NO_TASK_OPTION : "")}
                onChange={(taskKey) => handleTaskChange(index, taskKey)}
                options={[
                  ...(index === 0 ? [] : [{ value: "", label: "Selecciona una tarea" }]),
                  ...(index === 0 ? [{ value: NO_TASK_OPTION, label: "Ninguno" }] : []),
                  ...availableOptions.map((key) => ({ value: key, label: key }))
                ]}
              />
              {!selectedTask || record.taskKey === NO_TASK_OPTION ? (
                <Alert>Selecciona una tarea para completar este registro.</Alert>
              ) : (
                <DynamicRecordFields
                  record={record}
                  task={selectedTask}
                  brands={brands}
                  stores={stores}
                  onChange={(changes) => updateRecord(index, changes)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="form-actions sticky-actions">
        <Button icon={Save} loading={saving} onClick={handleSave} disabled={!tasks.length}>Guardar registros</Button>
      </div>

      {successDialog ? (
        <div className="save-success-overlay" role="presentation">
          <section
            className="save-success-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-success-title"
            aria-describedby="save-success-description"
          >
            <div className="save-success-icon" aria-hidden="true">
              <CheckCircle2 />
            </div>
            <div className="save-success-copy">
              <p className="eyebrow">Proceso completado</p>
              <h2 id="save-success-title">¡Registros guardados correctamente!</h2>
              <p id="save-success-description">
                Se guardaron {successDialog.saved} registro{successDialog.saved === 1 ? "" : "s"} sin errores.
              </p>
              <strong>Puntos acumulados: {successDialog.totalPoints}</strong>
            </div>
            <Button
              type="button"
              className="save-success-confirm"
              autoFocus
              onClick={() => setSuccessDialog(null)}
            >
              OK, continuar
            </Button>
          </section>
        </div>
      ) : null}
    </Panel>
  );
}

function DynamicRecordFields({ record, task, brands, stores, onChange }) {
  const title = getTaskTitle(task);
  const [, fallbackUnit] = getActivityCaptureMode(title);
  const type = recordCaptureType(task);
  const unit = task?.unidad_medida || task?.unidad_base || task?.unidad || fallbackUnit || "unidades";
  const flags = recordFieldFlags(task);
  const usesGuideBreakdown = flags.guia;
  const usesStore = flags.tienda;

  if (type === "cantidad") {
    return (
      <div className="form-grid">
        {(usesGuideBreakdown && record.usaGuias) || (flags.marca && record.usaMarcas) ? null : (
          <TextInput
            label={`Cantidad (${unit})`}
            type="number"
            min="0"
            value={record.cantidad}
            onChange={(cantidad) => onChange({ cantidad })}
          />
        )}
        {flags.hangtag ? <HangtagField record={record} onChange={onChange} /> : null}
        {flags.marca ? <BrandFields record={record} brands={brands} onChange={onChange} /> : null}
        {usesGuideBreakdown ? <GuideFields record={record} onChange={onChange} /> : null}
        {flags.lote ? <LoteField record={record} onChange={onChange} /> : null}
        <OptionalContextFields record={record} stores={stores} onChange={onChange} showStore={usesStore} />
        <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
      </div>
    );
  }

  if (type === "tiempo") {
    return (
      <div className="form-grid">
        {(usesGuideBreakdown && record.usaGuias) || (flags.marca && record.usaMarcas) ? null : (
          <TextInput
            label="Cantidad realizada"
            type="number"
            min="1"
            step="1"
            value={record.cantidad}
            onChange={(cantidad) => onChange({ cantidad })}
          />
        )}
        {flags.hangtag ? <HangtagField record={record} onChange={onChange} /> : null}
        {flags.marca ? <BrandFields record={record} brands={brands} onChange={onChange} /> : null}
        {usesGuideBreakdown ? <GuideFields record={record} onChange={onChange} /> : null}
        {flags.lote ? <LoteField record={record} onChange={onChange} /> : null}
        <OptionalContextFields record={record} stores={stores} onChange={onChange} showStore={usesStore} />
        <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
      </div>
    );
  }

  if (type === "fijo") {
    return (
      <div className="form-grid">
        <CheckboxInput
          label="Cumplido"
          checked
          disabled
          hint="Esta tarea siempre se registra como cumplida."
        />
        {flags.hangtag ? <HangtagField record={record} onChange={onChange} /> : null}
        {flags.marca ? <SingleBrandField record={record} brands={brands} onChange={onChange} /> : null}
        {flags.guia ? <SingleGuideField record={record} onChange={onChange} /> : null}
        {flags.lote ? <LoteField record={record} onChange={onChange} /> : null}
        <OptionalContextFields record={record} stores={stores} onChange={onChange} showStore={usesStore} />
        <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
        <Alert>Esta tarea usa el puntaje fijo definido por administracion.</Alert>
      </div>
    );
  }

  return (
    <div className="form-grid">
      <SelectInput
        label="Turno"
        value={record.turno}
        onChange={(turno) => onChange({ turno })}
        options={[SIMPLE_SHIFT, FULL_SHIFT]}
      />
      {flags.hangtag ? <HangtagField record={record} onChange={onChange} /> : null}
      {flags.marca ? <SingleBrandField record={record} brands={brands} onChange={onChange} /> : null}
      {flags.guia ? <SingleGuideField record={record} onChange={onChange} /> : null}
      {flags.lote ? <LoteField record={record} onChange={onChange} /> : null}
      <OptionalContextFields record={record} stores={stores} onChange={onChange} showStore={usesStore} />
      <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
      <Alert>
        Puntaje configurado: simple {task.puntaje_turno_simple || task.puntos_turno_simple || 0}, completo{" "}
        {task.puntaje_turno_completo || task.puntos_turno_completo || 0}.
      </Alert>
    </div>
  );
}

function OptionalContextFields({ record, stores, onChange, showStore = false }) {
  return (
    <>
      {showStore ? (
        <SelectInput
          label="Tienda"
          value={record.tiendaId}
          onChange={(tiendaId) => onChange({ tiendaId })}
          options={[
            { value: "", label: "Selecciona una tienda" },
            ...stores.map((store) => ({ value: String(store.id), label: store.nombre }))
          ]}
        />
      ) : null}
    </>
  );
}

function GuideFields({ record, onChange }) {
  return (
    <>
      <CheckboxInput
        label="Registrar varias guías"
        checked={record.usaGuias}
        onChange={(usaGuias) => onChange({
          usaGuias,
          guias: record.guias?.length ? record.guias : [emptyGuideShare()]
        })}
        hint="El puntaje se calculará una sola vez con la suma total."
      />
      {record.usaGuias ? (
        <GuideDistribution items={record.guias} onChange={(guias) => onChange({ guias })} />
      ) : null}
    </>
  );
}

function LoteField({ record, onChange }) {
  return (
    <TextInput
      label="Lote"
      value={record.lote}
      onChange={(lote) => onChange({ lote: lote.toUpperCase() })}
      placeholder="Ej. A05"
    />
  );
}

// Version de un solo valor de marca y guia, para las tareas que no tienen una
// cantidad total que repartir.
function SingleBrandField({ record, brands, onChange }) {
  return (
    <SelectInput
      label="Marca"
      value={record.marcaId}
      onChange={(marcaId) => onChange({ marcaId })}
      options={[
        { value: "", label: "Selecciona una marca" },
        ...brands.map((brand) => ({ value: String(brand.id), label: brand.nombre }))
      ]}
    />
  );
}

function SingleGuideField({ record, onChange }) {
  return (
    <TextInput
      label="Número de guía"
      value={record.numeroGuia}
      onChange={(numeroGuia) => onChange({ numeroGuia })}
      placeholder="Ej. GUIA-001"
    />
  );
}

function HangtagField({ record, onChange }) {
  return (
    <SelectInput
      label="Hangtag"
      value={record.tipoEtiquetado}
      onChange={(tipoEtiquetado) => onChange({ tipoEtiquetado })}
      options={HANGTAG_OPTIONS}
    />
  );
}

function BrandFields({ record, brands, onChange }) {
  return (
    <>
      <CheckboxInput
        label="Añadir marcas"
        checked={record.usaMarcas}
        onChange={(usaMarcas) =>
          onChange({
            usaMarcas,
            usaGuias: usaMarcas ? false : record.usaGuias,
            marcas: record.marcas?.length ? record.marcas : [emptyBrandShare()]
          })
        }
        hint="Actívalo para cargar la cantidad de cada marca por separado."
      />
      {record.usaMarcas ? (
        <BrandDistribution
          brands={brands}
          items={record.marcas}
          onChange={(marcas) => onChange({ marcas })}
        />
      ) : null}
    </>
  );
}

function logSortTime(log) {
  const value = new Date(log.created_at || log.fecha_registro || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function liveProgressNumber(value) {
  return Number(value || 0).toLocaleString("es-PE");
}

function liveProgressTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function liveProgressDate(value) {
  const raw = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short" }).format(date);
}

function liveProgressDuration(startValue, endValue = new Date().toISOString()) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return "--";
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function liveProgressMinutes(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return "--";
  const rounded = Math.max(1, Math.round(total));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function liveProgressUpdatedAt(activity) {
  return activity.updated_at || activity.updatedAt || activity.created_at || activity.hora_fin || activity.horaFin || null;
}

function WorkerLiveProgress({ user }) {
  const requestRef = useRef(null);
  const [data, setData] = useState({ activities: [], generatedAt: null, operationsMigrationRequired: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function refresh({ initial = false } = {}) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await loadWorkerLiveProgress({ signal: controller.signal });
      setData(result);
      setError("");
    } catch (err) {
      if (err?.name !== "AbortError") setError(friendlyError(err));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    refresh({ initial: true });
    const timer = window.setInterval(() => refresh(), 10_000);
    return () => {
      window.clearInterval(timer);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [user?.id]);

  const progressRecords = [...(data.activities || [])]
    .sort((a, b) => new Date(liveProgressUpdatedAt(b) || 0) - new Date(liveProgressUpdatedAt(a) || 0));
  const lastUpdate = data.generatedAt
    ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt))
    : "--:--";

  return (
    <Panel
      title="Mi progreso en vivo"
      eyebrow="Seguimiento del jefe de equipo"
      className="worker-live-progress-panel"
      actions={<Button variant="secondary" icon={RefreshCcw} loading={refreshing} onClick={() => refresh()}>Actualizar</Button>}
    >
      <div className="worker-progress-hero">
        <div>
          <span className="worker-progress-live"><i /> Sincronización en vivo</span>
          <h3>Consulta tus registros actualizados</h3>
          <p>Esta vista es de solo lectura. Verás automáticamente los cambios que tu jefe haga en horas, cantidad, datos de la tarea y puntaje.</p>
        </div>
        <div className="worker-progress-updated">
          <Clock3 />
          <span>Última lectura</span>
          <strong>{lastUpdate}</strong>
        </div>
      </div>

      {loading ? <LoadingBlock /> : null}
      {error ? <Alert type="error">No se pudo actualizar el progreso. {error}</Alert> : null}
      {data.historyMigrationRequired ? <Alert type="error">Falta aplicar la migración SQL 027 en Supabase para guardar y mostrar correctamente las horas del historial.</Alert> : null}
      {!loading && !progressRecords.length ? (
        <Alert>Aún no tienes registros por tiempo creados por un jefe de equipo. Cuando guarde uno, aparecerá aquí automáticamente.</Alert>
      ) : null}

      <div className="activity-session-grid worker-progress-grid">
        {progressRecords.map((activity) => <WorkerProgressCard key={activity.id} activity={activity} />)}
      </div>
    </Panel>
  );
}

function WorkerProgressCard({ activity }) {
  const [expanded, setExpanded] = useState(true);
  const history = activity.history || [];
  const lastAdvance = history.at(-1);
  const isOpen = activity.estado === "EN_CURSO";
  const isUpdated = activity.estado === "ACTUALIZADA" || Number(activity.revision || 1) > 1;
  const start = activity.hora_inicio || activity.horaInicio;
  const finish = activity.hora_fin || activity.horaFin;
  const duration = activity.tiempo_minutos ?? activity.tiempoMinutos;
  const taskName = activity.tarea_nombre || activity.actividad_nombre || `Tarea ${activity.tarea_id || ""}`;
  const statusLabel = isOpen ? "En curso" : isUpdated ? "Actualizado" : "Registrado";

  return (
    <article className={`activity-session-card ${isOpen ? "open" : "completed"} worker-progress-card`}>
      <button type="button" className="activity-session-summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className={`activity-session-status ${isOpen ? "" : "completed"}`}><i /> {statusLabel}</span>
        <span className="activity-session-title">
          <strong>{taskName}</strong>
          <small>Registrada por {activity.encargado_nombre || "Jefe de equipo"}</small>
        </span>
        <span className="activity-session-start">{liveProgressTime(start)} – {liveProgressTime(finish)}</span>
        <ChevronDown className={expanded ? "expanded" : ""} />
      </button>
      {expanded ? (
        <div className="activity-session-body">
          <div className="activity-session-stats">
            <div><span>Cantidad</span><strong>{liveProgressNumber(activity.cantidad)}</strong></div>
            <div><span>{isOpen ? "Tiempo transcurrido" : "Tiempo total"}</span><strong>{isOpen ? liveProgressDuration(start) : duration != null ? liveProgressMinutes(duration) : liveProgressDuration(start, finish)}</strong></div>
            <div><span>Puntaje</span><strong>{isOpen || activity.puntaje == null ? "Pendiente" : `${liveProgressNumber(activity.puntaje)} pts`}</strong></div>
          </div>

          <div className="worker-progress-context">
            <span>Fecha <strong>{liveProgressDate(activity.fecha_registro || start)}</strong></span>
            {activity.marca_nombre ? <span>Marca <strong>{activity.marca_nombre}</strong></span> : null}
            {activity.lote ? <span>Lote <strong>{activity.lote}</strong></span> : null}
            {activity.tienda_nombre ? <span>Tienda <strong>{activity.tienda_nombre}</strong></span> : null}
            {(activity.numero_guia || activity.codigo_guia) ? <span>Guía <strong>{activity.numero_guia || activity.codigo_guia}</strong></span> : null}
            {(activity.observacion || activity.detalle) ? <span>Detalle <strong>{activity.observacion || activity.detalle}</strong></span> : null}
          </div>

          <div className="worker-progress-current">
            <Timer />
            <div>
              <span>Última actualización del jefe</span>
              <strong>{lastAdvance ? `${liveProgressNumber(lastAdvance.cantidad)} a las ${liveProgressTime(lastAdvance.created_at)}` : liveProgressTime(liveProgressUpdatedAt(activity))}</strong>
            </div>
          </div>

          <WorkerProgressHistory activity={activity} />
        </div>
      ) : null}
    </article>
  );
}

function WorkerProgressHistory({ activity }) {
  const entries = activity.history || [];
  if (!entries.length) return null;
  return (
    <div className="activity-session-history">
      <h3>Detalle de actualizaciones</h3>
      <ol>
        {entries.map((entry, index) => {
          const previous = Number(entries[index - 1]?.cantidad || 0);
          const delta = Number(entry.cantidad || 0) - previous;
          return (
            <li key={entry.id || `${entry.tipo || "registro"}-${entry.created_at || index}`}>
              <span>{liveProgressTime(entry.created_at)}</span>
              <strong>{liveProgressNumber(entry.cantidad)} acumulado</strong>
              <small>{entry.tipo === "INICIO" ? "Actividad iniciada" : entry.tipo === "FINALIZACION" || entry.tipo === "REGISTRO" ? `Registrada · ${entry.puntaje ?? activity.puntaje ?? 0} pts` : index && delta ? `${delta > 0 ? "+" : ""}${liveProgressNumber(delta)} desde el valor anterior` : "Registro actualizado por el jefe"}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WorkerHistory({ user }) {
  const [sortOrder, setSortOrder] = useState("desc");
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [logs, tasks, stores] = await Promise.all([listWorkerActivityLogs(user.id), listTasks(), listTiendas()]);
      return { logs, tasks, stores };
    },
    [user?.id],
    { logs: [], tasks: [], stores: [] }
  );

  const taskNameById = Object.fromEntries((data.tasks || []).map((task) => [task.id, getTaskTitle(task) || `Tarea ${task.id}`]));
  const storeNameById = Object.fromEntries((data.stores || []).map((store) => [store.id, store.nombre]));
  const sortedLogs = [...(data.logs || [])].sort((a, b) => {
    const diff = logSortTime(a) - logSortTime(b);
    return sortOrder === "asc" ? diff : -diff;
  });
  const hasLeaderRecords = sortedLogs.some((log) => log.origen === "jefe_equipo");
  const rows = sortedLogs.map((log) => {
    const taskName = taskNameById[log.tarea_id] || log.actividad_nombre || "";
    const [tipoAct] = getActivityCaptureMode(taskName);
    const registeredByLeader = log.origen === "jefe_equipo";
    return {
      Fecha: formatDateTimeLima(log.created_at) || log.fecha_registro,
      "Hora inicio": log.hora_inicio ? liveProgressTime(log.hora_inicio) : "",
      "Hora fin": log.hora_fin ? liveProgressTime(log.hora_fin) : "",
      Tarea: taskName,
      Cantidad: log.cantidad ?? "",
      "Tiempo (min)": log.tiempo_minutos ?? "",
      Turno: log.turno || (tipoAct === "turno" ? displayShiftFromQuantity(log.cantidad) : ""),
      Cumplimiento: log.cumplimiento,
      Puntos: log.puntaje,
      Tienda: storeNameById[log.tienda_id] || "",
      Guia: log.numero_guia || "",
      Lote: log.lote || "",
      Marcas: (log.marcas || []).map((item) => `${item.marca_nombre}: ${item.cantidad}`).join(", "),
      "Registrado por": registeredByLeader ? (log.encargado_nombre || "Jefe de equipo") : "Tú",
      Detalle: log.detalle
    };
  });

  return (
    <Panel
      title="Historial"
      eyebrow="Registros"
      actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}
    >
      <div className="toolbar">
        <SelectInput
          label="Ordenar por fecha"
          value={sortOrder}
          onChange={setSortOrder}
          options={[
            { value: "desc", label: "Más reciente primero" },
            { value: "asc", label: "Más antigua primero" }
          ]}
        />
      </div>
      {loading ? <LoadingBlock /> : null}
      {error ? <Alert type="error">{error}</Alert> : null}
      {!loading && !rows.length ? <Alert>Aun no tienes registros.</Alert> : null}
      {hasLeaderRecords ? (
        <Alert>Los registros marcados como "Registrado por" un jefe de equipo fueron cargados por tu encargado a nombre tuyo.</Alert>
      ) : null}
      <DataTable rows={rows} />
    </Panel>
  );
}
