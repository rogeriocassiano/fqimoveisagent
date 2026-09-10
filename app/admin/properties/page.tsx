"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Property = { id: string; reference: string; title: string; type: string; city: string; neighborhood: string; address: string; sale_price: number; bedrooms: number; suites: number; bathrooms: number; parking_spaces: number; area: number; url: string; payload?: { photos?: string[]; description?: string; unit_features?: string; building_features?: string } };

function Photo({ src, alt, style }: { src?: string; alt: string; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  if (err || !src) return <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--panel)", color: "var(--muted)" }}>Sem foto</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ ...style, objectFit: "cover" }} onError={() => setErr(true)} />;
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({ reference: "", title: "", type: "apartamento", city: "Belo Horizonte", neighborhood: "", address: "", bedrooms: "", suites: "", bathrooms: "", parking_spaces: "", area: "", sale_price: "", url: "", status: "available", photos: "" });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  useEffect(() => { const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1]; if (!token) router.push("/login"); }, [router]);
  useEffect(() => { fetch("/api/properties").then((r) => r.json()).then((d) => setProperties(d.properties ?? [])); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? undefined : v]));
    const photos = form.photos.split("\n").map((u) => u.trim()).filter(Boolean);
    const payload = photos.length ? { photos } : undefined;
    const res = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, payload }) });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setProperties([data.property, ...properties]);
      setForm({ reference: "", title: "", type: "apartamento", city: "Belo Horizonte", neighborhood: "", address: "", bedrooms: "", suites: "", bathrooms: "", parking_spaces: "", area: "", sale_price: "", url: "", status: "available", photos: "" });
    } else {
      alert(data.error || "Erro ao salvar");
    }
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1 style={{ margin: "4px 0 8px" }}>Apartamentos</h1>
          <p className="lead">Cadastre e consulte os imóveis disponíveis. {properties.length} encontrados.</p>
        </div>
        <Link href="/admin" className="button ghost">Voltar</Link>
      </div>

      <section className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 16px" }}>Novo apartamento</h2>
        <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <input placeholder="Referência (código)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required />
            <input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <input placeholder="Bairro" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
            <input placeholder="Endereço" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <input placeholder="Quartos" type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} />
            <input placeholder="Suítes" type="number" value={form.suites} onChange={(e) => setForm({ ...form, suites: e.target.value })} />
            <input placeholder="Banheiros" type="number" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} />
            <input placeholder="Vagas" type="number" value={form.parking_spaces} onChange={(e) => setForm({ ...form, parking_spaces: e.target.value })} />
            <input placeholder="Área m²" type="number" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            <input placeholder="Preço de venda" type="number" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            <input placeholder="URL do anúncio" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <textarea placeholder="Fotos (uma URL por linha)" value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} rows={3} />
          <button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar apartamento"}</button>
        </form>
      </section>

      <section>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Imóveis cadastrados</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {properties.map((p) => (
            <button key={p.id} className="card" onClick={() => setSelected(p)} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", border: 0, width: "100%" }}>
              <Photo src={p.payload?.photos?.[0]} alt={p.title} style={{ width: "100%", height: 160, borderRadius: 12 }} />
              <h3 style={{ margin: "0 0 4px" }}>{p.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>{p.neighborhood} • {p.bedrooms ? `${p.bedrooms} quartos` : "—"}</p>
              <p style={{ color: "var(--accent)", fontWeight: 700, margin: 0 }}>R$ {p.sale_price?.toLocaleString("pt-BR") || "—"}</p>
              <p style={{ color: "var(--muted)", fontSize: ".75rem" }}>Ref: {p.reference}</p>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div className="card" style={{ width: 700, maxHeight: "90vh", overflow: "auto", position: "relative" }}>
            <button onClick={() => setSelected(null)} className="ghost" style={{ position: "absolute", top: 16, right: 16 }}>✕</button>
            <Photo src={selected.payload?.photos?.[selectedPhoto]} alt={selected.title} style={{ width: "100%", height: 300, borderRadius: 12 }} />
            {selected.payload?.photos && selected.payload.photos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, overflow: "auto" }}>
                {selected.payload.photos.map((url, i) => (
                  <img key={i} src={url} alt="" onClick={() => setSelectedPhoto(i)} style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: i === selectedPhoto ? "2px solid var(--accent)" : "2px solid transparent", opacity: i === selectedPhoto ? 1 : 0.6 }} />
                ))}
              </div>
            )}
            <h2 style={{ margin: "16px 0 8px" }}>{selected.title}</h2>
            <p style={{ color: "var(--muted)" }}>{selected.neighborhood} — {selected.address}</p>
            <p style={{ color: "var(--accent)", fontSize: "1.5rem", fontWeight: 700, margin: "12px 0" }}>R$ {selected.sale_price?.toLocaleString("pt-BR") || "—"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, margin: "16px 0" }}>
              <div><strong>Código</strong><p>{selected.reference}</p></div>
              <div><strong>Quartos</strong><p>{selected.bedrooms}</p></div>
              <div><strong>Suítes</strong><p>{selected.suites}</p></div>
              <div><strong>Banheiros</strong><p>{selected.bathrooms}</p></div>
              <div><strong>Vagas</strong><p>{selected.parking_spaces}</p></div>
              <div><strong>Área</strong><p>{selected.area} m²</p></div>
            </div>
            <p style={{ color: "var(--muted)", margin: "16px 0" }}>{selected.payload?.description}</p>
            {selected.payload?.unit_features && <p style={{ color: "var(--muted)", margin: "8px 0" }}><strong>Unidade:</strong> {selected.payload.unit_features}</p>}
            {selected.payload?.building_features && <p style={{ color: "var(--muted)", margin: "8px 0" }}><strong>Empreendimento:</strong> {selected.payload.building_features}</p>}
            <a href={selected.url} target="_blank" rel="noreferrer" className="button ghost">Ver anúncio no site</a>
          </div>
        </div>
      )}
    </main>
  );
}
