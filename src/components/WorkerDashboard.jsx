import { useMemo, useState } from "react";
import { Minus, Plus, RefreshCcw, Save } from "lucide-react";
import {
  createWorkerActivityLog,
  friendlyError,
  getTasksForUser,
  listBrands,
  listTaskScoreRanges,
  listTasks,
  listWorkerActivityLogs
} from "../lib/repository";
import { formatDateTimeLima, todayLimaISO } from "../lib/dates";
import {
  calculatePoints,
  displayShiftFromQuantity,
  FULL_SHIFT,
  getActivityCaptureMode,
  getTaskTitle,
  isGroupLeaderTimeTask,
  isFullShift,
  NO_TASK_OPTION,
  normalizeMeasurementType,
  SIMPLE_SHIFT,
  taskUsesBrandsByDefault
} from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import {
  Alert,
  Button,
  CheckboxInput,
  DataTable,
  LoadingBlock,
  Panel,
  SelectInput,
  Tabs,
  TextArea,
  TextInput
} from "./ui";
import { BrandDistribution, brandTotal, emptyBrandShare } from "./BrandDistribution";

function emptyRecord() {
  return {
    taskKey: "",
    cantidad: "",
    horas: "",
    minutos: "",
    usaTiempo: false,
    usaMarcas: false,
    marcas: [emptyBrandShare()],
    cumplimiento: true,
    turno: SIMPLE_SHIFT,
    detalle: ""
  };
}

export default function WorkerDashboard({ user, embedded = false }) {
  const [tab, setTab] = useState("Registrar actividad");

  return (
    <div className={embedded ? "stack embedded-worker" : "stack"}>
      <Tabs tabs={["Registrar actividad", "Historial"]} active={tab} onChange={setTab} />
      {tab === "Registrar actividad" ? <RegisterActivity user={user} /> : <WorkerHistory user={user} />}
    </div>
  );
}

function RegisterActivity({ user }) {
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [tasks, brands] = await Promise.all([getTasksForUser(user), listBrands()]);
      return { tasks, brands };
    },
    [user?.id],
    { tasks: [], brands: [] }
  );
  const tasks = data.tasks || [];
  const brands = data.brands || [];
  const [records, setRecords] = useState([emptyRecord()]);
  const [status, setStatus] = useState(null);
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
          ? { ...emptyRecord(), taskKey, usaMarcas: taskUsesBrandsByDefault(task) }
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

  function selectedTaskFor(record) {
    return taskMap[record.taskKey] || null;
  }

  function recordPayloadShape(record) {
    const task = selectedTaskFor(record);
    const title = getTaskTitle(task);
    const dbType = normalizeMeasurementType(task?.tipo_medicion);
    const [fallbackType, fallbackUnit] = getActivityCaptureMode(title);
    const type = isGroupLeaderTimeTask(task) ? "tiempo" : task?.tipo_medicion ? dbType : normalizeMeasurementType(fallbackType);
    const unit = task?.unidad_base || fallbackUnit;
    const marcas = record.usaMarcas
      ? record.marcas.map((item) => ({ marca_id: Number(item.marca_id), cantidad: Number(item.cantidad) }))
      : [];

    let cantidad = null;
    let cantidadPuntaje = null;
    let tiempoMinutos = null;
    let cumplimiento = record.cumplimiento;
    let turno = null;

    if (type === "cantidad") {
      cantidad = record.cantidad === "" ? null : Number(record.cantidad);
      cumplimiento = true;
      if (record.usaTiempo) {
        tiempoMinutos = Number(record.horas || 0) * 60 + Number(record.minutos || 0);
      }
    }
    if (type === "tiempo") {
      cantidad = record.cantidad === "" ? null : Number(record.cantidad);
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

    return { task, title, type, unit, cantidad, cantidadPuntaje, tiempoMinutos, cumplimiento, turno, marcas };
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
      if (record.usaMarcas) {
        const total = Number(record.cantidad || 0);
        const distributed = brandTotal(record.marcas);
        if (total <= 0) return `Ingresa primero la cantidad total para ${shape.title}.`;
        if (!record.marcas.length || record.marcas.some((item) => !item.marca_id || Number(item.cantidad) <= 0)) {
          return `Completa cada marca y su cantidad para ${shape.title}.`;
        }
        if (new Set(record.marcas.map((item) => String(item.marca_id))).size !== record.marcas.length) {
          return `No puedes repetir una marca en ${shape.title}.`;
        }
        if (distributed !== total) {
          return `La distribución por marcas de ${shape.title} debe sumar exactamente ${total}. Actualmente suma ${distributed}.`;
        }
      }
      if (shape.type === "cantidad" && !record.usaMarcas && (record.cantidad === "" || Number(record.cantidad) < 0)) {
        return `Ingresa una cantidad valida para ${shape.title}.`;
      }
      if (shape.type === "tiempo" && (record.cantidad === "" || Number(record.cantidad) <= 0)) {
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
            puntos_obtenidos: points,
            marcas: shape.marcas
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
      setStatus({ type: "success", message: `Se guardaron ${saved} registros. Puntos acumulados: ${totalPoints}.` });
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
              <div className="record-title">Registro {index + 1}</div>
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
    </Panel>
  );
}

function DynamicRecordFields({ record, task, brands, onChange }) {
  const title = getTaskTitle(task);
  const dbType = normalizeMeasurementType(task?.tipo_medicion);
  const [fallbackType, fallbackUnit] = getActivityCaptureMode(title);
  const type = isGroupLeaderTimeTask(task) ? "tiempo" : task?.tipo_medicion ? dbType : normalizeMeasurementType(fallbackType);
  const unit = task?.unidad_base || fallbackUnit || "unidades";

  if (type === "cantidad") {
    return (
      <div className="form-grid">
        <TextInput
          label={`Cantidad (${unit})`}
          type="number"
          min="0"
          value={record.cantidad}
          onChange={(cantidad) => onChange({ cantidad })}
        />
        <BrandFields record={record} brands={brands} onChange={onChange} />
        <CheckboxInput label="Agregar tiempo" checked={record.usaTiempo} onChange={(usaTiempo) => onChange({ usaTiempo })} />
        <TextInput
          label="Horas"
          type="number"
          min="0"
          value={record.horas}
          disabled={!record.usaTiempo}
          onChange={(horas) => onChange({ horas })}
        />
        <TextInput
          label="Minutos"
          type="number"
          min="0"
          value={record.minutos}
          disabled={!record.usaTiempo}
          onChange={(minutos) => onChange({ minutos })}
        />
        <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
      </div>
    );
  }

  if (type === "tiempo") {
    return (
      <div className="form-grid">
        <TextInput
          label="Cantidad realizada"
          type="number"
          min="1"
          step="1"
          value={record.cantidad}
          onChange={(cantidad) => onChange({ cantidad })}
        />
        <BrandFields record={record} brands={brands} onChange={onChange} />
        <Alert>El jefe de equipo agregará el tiempo después de que guardes este registro.</Alert>
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
      <TextArea label="Detalle" value={record.detalle} onChange={(detalle) => onChange({ detalle })} placeholder="Comentarios opcionales" />
      <Alert>
        Puntaje configurado: simple {task.puntaje_turno_simple || task.puntos_turno_simple || 0}, completo{" "}
        {task.puntaje_turno_completo || task.puntos_turno_completo || 0}.
      </Alert>
    </div>
  );
}

function BrandFields({ record, brands, onChange }) {
  return (
    <>
      <CheckboxInput
        label="Añadir marcas"
        checked={record.usaMarcas}
        onChange={(usaMarcas) => onChange({ usaMarcas, marcas: record.marcas?.length ? record.marcas : [emptyBrandShare()] })}
        hint="Actívalo para repartir la cantidad entre las marcas existentes."
      />
      {record.usaMarcas ? (
        <BrandDistribution
          brands={brands}
          items={record.marcas}
          expectedTotal={record.cantidad}
          onChange={(marcas) => onChange({ marcas })}
        />
      ) : null}
    </>
  );
}

export function WorkerHistory({ user }) {
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [logs, tasks] = await Promise.all([listWorkerActivityLogs(user.id), listTasks()]);
      return { logs, tasks };
    },
    [user?.id],
    { logs: [], tasks: [] }
  );

  const taskNameById = Object.fromEntries((data.tasks || []).map((task) => [task.id, getTaskTitle(task) || `Tarea ${task.id}`]));
  const rows = (data.logs || []).map((log) => {
    const taskName = taskNameById[log.tarea_id] || log.actividad_nombre || "";
    const [tipoAct] = getActivityCaptureMode(taskName);
    return {
      Fecha: formatDateTimeLima(log.created_at) || log.fecha_registro,
      Tarea: taskName,
      Cantidad: log.cantidad ?? "",
      Turno: log.turno || (tipoAct === "turno" ? displayShiftFromQuantity(log.cantidad) : ""),
      "Tiempo (min)": log.tiempo_minutos,
      "Estado tiempo": isGroupLeaderTimeTask(data.tasks?.find((task) => String(task.id) === String(log.tarea_id)))
        ? Number(log.tiempo_minutos || 0) > 0
          ? "Registrado por jefe"
          : "Pendiente del jefe"
        : "No aplica",
      Cumplimiento: log.cumplimiento,
      Puntos: log.puntos_obtenidos,
      Marcas: (log.marcas || []).map((item) => `${item.marca_nombre}: ${item.cantidad}`).join(", "),
      Detalle: log.detalle
    };
  });

  return (
    <Panel title="Historial" eyebrow="Registros" actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}>
      {loading ? <LoadingBlock /> : null}
      {error ? <Alert type="error">{error}</Alert> : null}
      {!loading && !rows.length ? <Alert>Aun no tienes registros.</Alert> : null}
      <DataTable rows={rows} />
    </Panel>
  );
}
