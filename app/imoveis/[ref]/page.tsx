"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import "../../home.css";

type Property = {
  id?: string;
  reference: string;
  title?: string;
  type?: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  parking_spaces?: number;
  area?: number;
  sale_price?: number;
  condominium_fee?: number;
  property_tax?: number;
  url?: string;
  payload?: { photos?: string[]; description?: string; unit_features?: string; building_features?: string };
};

const phone = "553196263003";
const wa = (text: string) => `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
const money = (v?: number) => (v ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Consulte");

export default function PropertyPage() {
  const params = useParams<{ ref: string }>();
  const ref = decodeURIComponent(params.ref ?? "");
  const [property, setProperty] = useState<Property | null>(null);
  const [related, setRelated] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [menu, setMenu] = useState(false);
  const isAdmin = useSyncExternalStore(() => () => {}, () => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    const role = document.cookie.match(/sb-role=([^;]+)/)?.[1];
    return Boolean(token && (role === "admin" || role === "director"));
  }, () => false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/properties?reference=${encodeURIComponent(ref)}`).then((r) => r.json()),
      fetch("/api/properties").then((r) => r.json()),
    ]).then(([detail, all]) => {
      const found = (detail.properties ?? [])[0] ?? null;
      setProperty(found);
      setRelated(((all.properties ?? []) as Property[]).filter((p) => p.reference !== ref).slice(0, 3));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [ref]);

  const photos = property?.payload?.photos ?? [];
  const photo = photos[photoIndex] ?? photos[0];
  const title = property?.title ?? `Imóvel ${ref}`;
  const visitMsg = wa(`Olá! Quero agendar uma visita no imóvel Ref ${ref} - ${title}.`);
  const infoMsg = wa(`Olá! Tenho interesse no imóvel Ref ${ref} - ${title}. Pode me passar mais informações?`);

  const traits = property
    ? [
        ["⌂", "Tipo do Imóvel", property.type ?? "Apartamento"],
        ["⬒", "Área Privativa", property.area ? `${property.area} m²` : null],
        ["▤", "Quartos", property.bedrooms != null ? String(property.bedrooms) : null],
        ["▥", "Suítes", property.suites ? String(property.suites) : null],
        ["▦", "Banheiros", property.bathrooms != null ? String(property.bathrooms) : null],
        ["▧", "Vagas", property.parking_spaces != null ? String(property.parking_spaces) : null],
        ["◈", "Condomínio", property.condominium_fee ? money(property.condominium_fee) : null],
        ["◈", "IPTU", property.property_tax ? money(property.property_tax) : null],
        ["◎", "Localização", [property.neighborhood, property.city].filter(Boolean).join(" - ") || null],
      ].filter((row): row is [string, string, string] => Boolean(row[2]))
    : [];

  return (
    <main className="fq-site fq-detail-page">
      <header className="fq-detail-header">
        <Link href="/" aria-label="Voltar para a página inicial"><Image src="/site/logo.png" width={120} height={46} alt="Imobiliária FQ Imóveis" priority /></Link>
        <div>
          <a href={wa("Olá, estou visitando o site da FQ Imóveis e quero atendimento.")} target="_blank" rel="noreferrer"><b>(31) 9626-3003</b><small>WhatsApp</small></a>
          <button type="button" aria-label="Abrir menu" onClick={() => setMenu(true)}><span /><span /><span /></button>
        </div>
      </header>

      {loading && <p className="fq-detail-status">Carregando imóvel…</p>}
      {!loading && !property && (
        <section className="fq-detail-status"><h1>Imóvel não encontrado</h1><p>O anúncio Ref {ref} não está disponível.</p><Link href="/">← Voltar para a busca</Link></section>
      )}

      {property && (
        <>
          <section className="fq-detail-hero">
            <div className="fq-detail-info">
              <h1>Venda: {money(property.sale_price)}</h1>
              <div className="fq-detail-actions">
                <a className="fq-btn-visit" href={visitMsg} target="_blank" rel="noreferrer">Agendar Visita</a>
                <a className="fq-btn-ghost" href={infoMsg} target="_blank" rel="noreferrer">Fazer Proposta</a>
              </div>
              <nav className="fq-crumb">
                {["Home", "Imóveis", "Venda", property.city, property.neighborhood, property.title, property.type, property.reference]
                  .filter(Boolean).map((part, i, arr) => <span key={i}>{part}{i < arr.length - 1 ? " ›" : ""}</span>)}
              </nav>

              <h2 className="fq-traits-title">CARACTERÍSTICAS DO IMÓVEL</h2>
              <ul className="fq-traits">{traits.map(([icon, label, value]) => <li key={label}><span className="fq-trait-icon">{icon}</span><span className="fq-trait-label">{label}</span><span className="fq-trait-value">{value}</span></li>)}</ul>
            </div>

            <div className="fq-detail-side">
              <div className="fq-gallery">
                {photo ? <img src={photo} alt={title} /> : <div className="fq-gallery-empty">FQ</div>}
                {photos.length > 1 && (
                  <>
                    <button type="button" className="fq-gallery-prev" aria-label="Foto anterior" onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)}>‹</button>
                    <button type="button" className="fq-gallery-next" aria-label="Próxima foto" onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}>›</button>
                  </>
                )}
                {photos.length > 0 && <span className="fq-gallery-count">▤ {photos.length} Fotos</span>}
                {isAdmin && property.id && <Link className="fq-edit" href={`/admin/properties?edit=${property.id}`} title="Editar anúncio">✎</Link>}
              </div>
              {photos.length > 1 && (
                <div className="fq-thumbs">{photos.map((p, i) => (
                  <button key={i} type="button" className={i === photoIndex ? "active" : ""} onClick={() => setPhotoIndex(i)}><img src={p} alt={`Foto ${i + 1}`} /></button>
                ))}</div>
              )}
              <div className="fq-side-ctas">
                <a className="fq-btn-orange" href={infoMsg} target="_blank" rel="noreferrer">Quero mais informações</a>
                <span className="fq-or">OU</span>
                <a className="fq-btn-line" href={infoMsg} target="_blank" rel="noreferrer">◔ Converse pelo Whatsapp</a>
                <a className="fq-btn-line" href={visitMsg} target="_blank" rel="noreferrer">◷ Agendar Visita</a>
              </div>
            </div>
          </section>

          {(property.payload?.description || property.payload?.unit_features || property.payload?.building_features) && (
            <section className="fq-description">
              <h2>DESCRIÇÃO</h2>
              {property.payload?.description && <p>{property.payload.description}</p>}
              {property.payload?.unit_features && <><h3>Unidade</h3><p>{property.payload.unit_features}</p></>}
              {property.payload?.building_features && <><h3>Empreendimento</h3><p>{property.payload.building_features}</p></>}
              {property.url && <a className="fq-original-link" href={property.url} target="_blank" rel="noreferrer">Ver anúncio original ↗</a>}
            </section>
          )}
        </>
      )}

      {related.length > 0 && (
        <section className="fq-results fq-related">
          <h2>SELECIONAMOS PARA VOCÊ</h2>
          <div className="fq-property-grid">{related.map((p) => (
            <article key={p.id ?? p.reference} className="fq-property-card">
              <div className="fq-property-photo"><Link className="fq-photo-link" href={`/imoveis/${p.reference}`}>{p.payload?.photos?.[0] ? <img src={p.payload.photos[0]} alt={p.title} /> : <span>FQ</span>}</Link></div>
              <Link className="fq-property-info" href={`/imoveis/${p.reference}`}><small>REF. {p.reference}</small><h2>{p.title}</h2><p>{p.neighborhood} · {p.city}</p><p className="fq-details">{p.bedrooms || 0} quartos &nbsp; {p.parking_spaces || 0} vagas &nbsp; {p.area ? `${p.area} m²` : ""}</p><strong>{p.sale_price ? p.sale_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Consulte"}</strong></Link>
            </article>
          ))}</div>
        </section>
      )}

      <footer className="fq-footer"><div><h2>CONTATO</h2><p>Rua Cariri, 26</p><p>Nova Suíça - Belo Horizonte</p><p>Email: contato@felipequeiroz.com.br</p><a href={wa("Olá! Vim pelo site.")} target="_blank" rel="noreferrer">(31) 9626-3003</a></div><div className="fq-footer-brand" style={{ position: "static", transform: "none" }}><Image src="/site/logo.png" width={190} height={74} alt="FQ Imóveis" /><strong>CRECI: 36760</strong></div></footer>

      <a className="fq-wa-float" href={infoMsg} target="_blank" rel="noreferrer" aria-label="Conversar no WhatsApp">◔</a>

      {menu && <><button className="fq-menu-mask" type="button" onClick={() => setMenu(false)} aria-label="Fechar menu" /><aside className="fq-menu"><button type="button" onClick={() => setMenu(false)} aria-label="Fechar">×</button><Image src="/site/logo.png" width={170} height={65} alt="FQ Imóveis" /><nav><Link href="/" onClick={() => setMenu(false)}>Vender imóveis</Link><Link href="/#resultados" onClick={() => setMenu(false)}>Comprar imóveis</Link><Link href="/#blog" onClick={() => setMenu(false)}>Blogs</Link><Link href="/#sobre" onClick={() => setMenu(false)}>Sobre nós</Link><a href={wa("Olá! Vim pelo site.")} target="_blank" rel="noreferrer">Contato</a>{isAdmin ? <><Link href="/admin">Painel IA</Link><Link href="/admin/properties">Adicionar imóvel</Link></> : <Link href="/login">Login</Link>}</nav></aside></>}
    </main>
  );
}
