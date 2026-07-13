import { useMemo, useState } from "react";
import { RefreshCcw, Save } from "lucide-react";
import {
  createIncidente,
  friendlyError,
  listIncidentes,
  listOperantesAndTeamLeads,
  listTasks,
  listTiendas
} from "../lib/repository";
import { formatDateTimeLima } from "../lib/dates";
import { getTaskTitle } from "../lib/scoring";
import { useAsyncData } from "../lib/hooks";
import {
  Alert,
  Button,
  DataTable,
  LoadingBlock,
  Panel,
  SelectInput,
  Tabs,
  TextArea,
  TextInput
} from "./ui";
import WorkerDashboard from "./WorkerDashboard";

const incidentTurns = ["turno regular", "incidencia", "turno extra"];
const errorTypes = ["CONTENIDO", "LIBERADO"];

export default function TeamLeaderDashboard({ user }) {
  const [tab, setTab] = useState("Registro de actividad");

  return (
    <div className="stack">
      <Tabs tabs={["Registro de actividad", "Reporte de incidencia"]} active={tab} onChange={setTab} />
      {tab === "Registro de actividad" ? <WorkerDashboard user={user} embedded /> : <IncidentPanel user={user} />}
    </div>
  );
}

function IncidentPanel({ user }) {
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [tasks, tiendas, users, incidentes] = await Promise.all([
        listTasks(),
        listTiendas(),
        listOperantesAndTeamLeads(),
        listIncidentes()
      ]);
      return { tasks, tiendas, users, incidentes };
    },
    [],
    { tasks: [], tiendas: [], users: [], incidentes: [] }
  );

  const [form, setForm] = useState({
    usuarioId: "",
    turno: "turno regular",
    tareaId: "",
    tiendaId: "",
    numero_guia: "",
    observacion: "",
    tipo_error: "CONTENIDO"
  });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const selectedUser = (data.users || []).find((item) => String(item.id) === String(form.usuarioId));
  const selectedTask = (data.tasks || []).find((item) => String(item.id) === String(form.tareaId));
  const selectedStore = (data.tiendas || []).find((item) => String(item.id) === String(form.tiendaId));

  const tiendaById = useMemo(
    () => Object.fromEntries((data.tiendas || []).map((tienda) => [tienda.id, tienda.nombre])),
    [data.tiendas]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);

    if (!selectedUser) {
      setStatus({ type: "error", message: "Debes seleccionar un usuario." });
      return;
    }
    if (!selectedTask) {
      setStatus({ type: "error", message: "Debes seleccionar una tarea." });
      return;
    }
    if (!selectedStore) {
      setStatus({ type: "error", message: "Debes seleccionar una tienda." });
      return;
    }

    setSaving(true);
    try {
      await createIncidente({
        turno: form.turno,
        nombre: selectedUser.nombre || selectedUser.email,
        tarea_id: selectedTask.id,
        tarea_nombre: getTaskTitle(selectedTask),
        tienda_id: selectedStore.id,
        numero_guia: form.numero_guia.trim() || null,
        observacion: form.observacion.trim() || null,
        tipo_error: form.tipo_error,
        created_by: user.id
      });
      setForm({
        usuarioId: "",
        turno: "turno regular",
        tareaId: "",
        tiendaId: "",
        numero_guia: "",
        observacion: "",
        tipo_error: "CONTENIDO"
      });
      setStatus({ type: "success", message: "Incidente registrado correctamente." });
      reload();
    } catch (err) {
      setStatus({ type: "error", message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }

  const rows = (data.incidentes || []).map((item) => ({
    Fecha: formatDateTimeLima(item.created_at),
    Turno: item.turno,
    Nombre: item.nombre,
    Tarea: item.tarea_nombre,
    Tienda: tiendaById[item.tienda_id],
    Guia: item.numero_guia,
    Observacion: item.observacion,
    "Tipo Error": item.tipo_error
  }));

  return (
    <div className="stack">
      <Panel title="Reportar incidencias" eyebrow="Jefe de equipo" actions={<Button variant="secondary" icon={RefreshCcw} onClick={reload}>Actualizar</Button>}>
        {loading ? <LoadingBlock /> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {status ? <Alert type={status.type}>{status.message}</Alert> : null}
        {!loading && !(data.tiendas || []).length ? <Alert>Aun no hay tiendas registradas.</Alert> : null}
        {!loading && !(data.users || []).length ? <Alert>No hay usuarios operantes o jefes de equipo para seleccionar.</Alert> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <SelectInput
            label="Nombre"
            value={form.usuarioId}
            onChange={(usuarioId) => setForm({ ...form, usuarioId })}
            options={[
              { value: "", label: "Selecciona un usuario" },
              ...(data.users || []).map((item) => ({ value: String(item.id), label: `${item.id} - ${item.nombre || item.email}` }))
            ]}
          />
          <SelectInput label="Turno" value={form.turno} onChange={(turno) => setForm({ ...form, turno })} options={incidentTurns} />
          <SelectInput
            label="Proceso / Tarea"
            value={form.tareaId}
            onChange={(tareaId) => setForm({ ...form, tareaId })}
            options={[
              { value: "", label: "Selecciona una tarea" },
              ...(data.tasks || []).map((task) => ({ value: String(task.id), label: `${task.id} - ${getTaskTitle(task) || "Sin titulo"}` }))
            ]}
          />
          <SelectInput
            label="Tienda"
            value={form.tiendaId}
            onChange={(tiendaId) => setForm({ ...form, tiendaId })}
            options={[
              { value: "", label: "Selecciona una tienda" },
              ...(data.tiendas || []).map((tienda) => ({ value: String(tienda.id), label: tienda.nombre }))
            ]}
          />
          <TextInput label="Numero de guia" value={form.numero_guia} onChange={(numero_guia) => setForm({ ...form, numero_guia })} />
          <SelectInput label="Tipo de error" value={form.tipo_error} onChange={(tipo_error) => setForm({ ...form, tipo_error })} options={errorTypes} />
          <TextArea label="Observacion" value={form.observacion} onChange={(observacion) => setForm({ ...form, observacion })} />
          <div className="form-span">
            <Button type="submit" icon={Save} loading={saving}>Registrar incidente</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Historial de incidentes">
        {!loading && !rows.length ? <Alert>Todavia no hay incidentes registrados.</Alert> : null}
        <DataTable rows={rows} />
      </Panel>
    </div>
  );
}
