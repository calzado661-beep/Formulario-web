import { Plus, Trash2 } from "lucide-react";
import { Button, TextInput } from "./ui";

export function emptyGuideShare() {
  return { numero_guia: "", cantidad: "" };
}

export function guideTotal(items) {
  return (items || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
}

export function GuideDistribution({ items, onChange }) {
  const shares = items?.length ? items : [emptyGuideShare()];
  const total = guideTotal(shares);

  function update(index, changes) {
    onChange(shares.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  }

  function remove(index) {
    const next = shares.filter((_, itemIndex) => itemIndex !== index);
    onChange(next.length ? next : [emptyGuideShare()]);
  }

  return (
    <div className="form-span brand-distribution">
      <div className="brand-distribution-header">
        <div>
          <strong>Guías revisadas</strong>
          <span>Agrega cada número de guía con la cantidad revisada.</span>
        </div>
        <Button variant="secondary" icon={Plus} onClick={() => onChange([...shares, emptyGuideShare()])}>
          Añadir guía
        </Button>
      </div>

      {shares.map((share, index) => (
        <div className="brand-share-row" key={index}>
          <TextInput
            label={`Número de guía ${index + 1}`}
            value={share.numero_guia}
            onChange={(numero_guia) => update(index, { numero_guia })}
            placeholder="Ej. GUIA-001"
          />
          <TextInput
            label="Cantidad"
            type="number"
            min="1"
            step="1"
            value={share.cantidad}
            onChange={(cantidad) => update(index, { cantidad })}
          />
          <Button variant="ghost" icon={Trash2} onClick={() => remove(index)} disabled={shares.length === 1}>
            Quitar
          </Button>
        </div>
      ))}

      <div className={`brand-total ${total > 0 ? "complete" : "pending"}`}>
        Cantidad total: <strong>{total}</strong>
      </div>
    </div>
  );
}
