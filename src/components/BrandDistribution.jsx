import { Plus, Trash2 } from "lucide-react";
import { Button, SelectInput, TextInput } from "./ui";

export function emptyBrandShare() {
  return { marca_id: "", cantidad: "" };
}

export function brandTotal(items) {
  return (items || []).reduce((total, item) => total + Number(item.cantidad || 0), 0);
}

export function BrandDistribution({ brands, items, onChange }) {
  const shares = items?.length ? items : [emptyBrandShare()];
  const total = brandTotal(shares);

  function update(index, changes) {
    onChange(shares.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  }

  function remove(index) {
    const next = shares.filter((_, itemIndex) => itemIndex !== index);
    onChange(next.length ? next : [emptyBrandShare()]);
  }

  return (
    <div className="form-span brand-distribution">
      <div className="brand-distribution-header">
        <div>
          <strong>Cantidad por marca</strong>
          <span>Agrega cada marca con su cantidad. El puntaje se calcula sobre el total.</span>
        </div>
        <Button variant="secondary" icon={Plus} onClick={() => onChange([...shares, emptyBrandShare()])}>
          Añadir marca
        </Button>
      </div>

      {shares.map((share, index) => {
        const selectedElsewhere = new Set(
          shares.filter((_, itemIndex) => itemIndex !== index).map((item) => String(item.marca_id)).filter(Boolean)
        );
        return (
          <div className="brand-share-row" key={index}>
            <SelectInput
              label={`Marca ${index + 1}`}
              value={share.marca_id}
              onChange={(marca_id) => update(index, { marca_id })}
              options={[
                { value: "", label: "Selecciona marca" },
                ...brands
                  .filter((brand) => !selectedElsewhere.has(String(brand.id)))
                  .map((brand) => ({ value: String(brand.id), label: brand.nombre }))
              ]}
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
        );
      })}

      <div className={`brand-total ${total > 0 ? "complete" : "pending"}`}>
        Cantidad total: <strong>{total}</strong>
      </div>
    </div>
  );
}
