"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./home.css";

type Property = { id?: string; reference: string; title: string; type: string; city: string; neighborhood: string; bedrooms: number; parking_spaces: number; area: number; sale_price: number; payload?: { photos?: string[] } };

const whatsapp = "https://api.whatsapp.com/send?phone=553196263003&text=Olá, estou visitando o site da FQ Imóveis, gostaria de um atendimento personalizado. Pode me ajudar?";
const testimonials = [
  { name: "Larissa & Herbert Família #13 2023", photo: "https://fotos.sobressai.com.br/fotos/corretores/2016/2284696/2284696_g.jpg?v=0", text: "Agradeço demais por toda a atenção que nos foi dada neste processo! Vocês são demais!" },
  { name: "Thaiza Família #05 2023", photo: "https://fotos.sobressai.com.br/fotos/corretores/2016/2284682/2284682_g.jpg?v=0", text: "Muito obrigada a todos os envolvidos na realização desse sonho, e pra quem ainda vai comprar eu super indico a FQ Imóveis." },
  { name: "Samira Família #42 2022", photo: "https://fotos.sobressai.com.br/fotos/corretores/2016/2284681/2284681_g.jpg?v=0", text: "Obrigado! Gratidão é a palavra que nos define. Muito obrigada à família FQ Imóveis pela paciência e dedicação com nós." },
  { name: "Samantha e Jeremias Família #18 2021", photo: "https://fotos.sobressai.com.br/fotos/corretores/2016/2284670/2284670_g.jpg?v=0", text: "Uma experiência excepcional, tanto no pré quanto no pós compra. Totalmente verdadeiros nas informações e extremamente atenciosos." },
  { name: "Rebecca e Guilherme Família #34 2022", photo: "https://fotos.sobressai.com.br/fotos/corretores/2016/2284425/2284425_g.jpg?v=0", text: "Muito obrigada por todo o carinho e por toda atenção! Vocês foram cruciais para a realização do nosso sonho." },
];
const videos = ["FF3kEiKLxEU", "bzAO4VTjDDE", "k7VNXEbRrVs", "dUDlVGNwnXo"];
const propertyTypes = ["Para Venda", "Apartamento", "Apartamento com Área Privativa", "Apartamento com Cobertura", "Casa com área privativa", "Casa em Condomínio", "Cobertura", "Cobertura Duplex", "Studio"];
const cities = ["Belo Horizonte", "Betim", "Contagem", "Ribeirão das Neves", "Sabará", "Vespasiano"];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filters, setFilters] = useState({ type: "", city: "", neighborhood: "" });
  const [searched, setSearched] = useState(false);
  const isAdmin = useSyncExternalStore(() => () => {}, () => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    const role = document.cookie.match(/sb-role=([^;]+)/)?.[1];
    return Boolean(token && (role === "admin" || role === "director"));
  }, () => false);
  const testimonialsRef = useRef<HTMLDivElement | null>(null);
  const videosRef = useRef<HTMLDivElement | null>(null);

  function scrollCarousel(element: HTMLDivElement | null, direction: number) {
    element?.scrollBy({ left: direction * Math.max(element.clientWidth * .85, 320), behavior: "smooth" });
  }

  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then((data) => setProperties(data.properties ?? [])).catch(() => undefined);
  }, []);

  const choices = useMemo(() => ({
    types: [...new Set(properties.map((p) => p.type).filter(Boolean))].sort(),
    cities: [...new Set(properties.map((p) => p.city).filter(Boolean))].sort(),
    neighborhoods: [...new Set(properties.filter((p) => !filters.city || p.city === filters.city).map((p) => p.neighborhood).filter(Boolean))].sort(),
  }), [properties, filters.city]);
  const results = properties.filter((p) => (!filters.type || p.type === filters.type) && (!filters.city || p.city === filters.city) && (!filters.neighborhood || p.neighborhood === filters.neighborhood));

  return <main className="fq-site">
    <section className="fq-hero">
      <video className="fq-hero-background" autoPlay muted loop playsInline preload="auto"><source src="/site/video.mp4" type="video/mp4" /></video>
      <Link className="fq-logo" href="/"><Image src="/site/logo.png" width={235} height={90} alt="Imobiliária FQ Imóveis" priority /></Link>
      <a className="fq-contact" href={whatsapp} target="_blank" rel="noreferrer"><span className="fq-whatsapp-icon">◔</span><span><b>(31) 9626-3003</b><small>WhatsApp</small></span></a>
      <button className="fq-menu-trigger" type="button" aria-label="Abrir menu" onClick={() => setMenu(true)}><span /><span /><span /></button>
      <form className="fq-search" onSubmit={(event) => { event.preventDefault(); setSearched(true); setTimeout(() => document.getElementById("resultados")?.scrollIntoView({ behavior: "smooth" }), 0); }}>
        <label><span>Tipo de imovel</span><select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="" />{choices.types.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Cidade</span><select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value, neighborhood: "" })}><option value="" />{choices.cities.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Bairro</span><select value={filters.neighborhood} onChange={(e) => setFilters({ ...filters, neighborhood: e.target.value })}><option value="" />{choices.neighborhoods.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button type="submit">Encontrar imóvel</button>
        <button className="fq-advanced" type="button">BUSCA AVANÇADA <span>⌄</span></button>
      </form>
      <div className="fq-scroll-cue">⌄</div>
    </section>

    <section className="fq-results" id="resultados">
      <p className="fq-section-label">IMÓVEIS EM DESTAQUE</p><h1>{searched ? "Resultado da busca" : "Encontre o imóvel ideal"}</h1>
      <div className="fq-property-grid">{results.slice(0, 12).map((property) => <article key={property.id ?? property.reference} className="fq-property-card">
        <div className="fq-property-photo"><Link className="fq-photo-link" href={`/imoveis/${property.reference}`}>{property.payload?.photos?.[0] ? <img src={property.payload.photos[0]} alt={property.title} /> : <span>FQ</span>}</Link>{isAdmin && property.id && <Link className="fq-edit" href={`/admin/properties?edit=${property.id}`} title="Editar anúncio">✎</Link>}</div>
        <Link className="fq-property-info" href={`/imoveis/${property.reference}`}><small>REF. {property.reference}</small><h2>{property.title}</h2><p>{property.neighborhood} · {property.city}</p><p className="fq-details">{property.bedrooms || 0} quartos &nbsp; {property.parking_spaces || 0} vagas &nbsp; {property.area ? `${property.area} m²` : ""}</p><strong>{property.sale_price ? property.sale_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Consulte"}</strong></Link>
      </article>)}</div>
      {!results.length && <p className="fq-no-results">Nenhum imóvel encontrado.</p>}
    </section>

    <section className="fq-about" id="sobre"><div><h2>QUEM SOMOS?</h2><p>Somos uma imobiliária familiar com mais de 10 anos de experiência no mercado imobiliário!</p><p>Fundada por Felipe Queiroz em 07 de março de 2016. Em março de 2019, Marcela Drummond e Felipe Queiroz tornam-se sócios. Hoje, Marcela e Felipe são casados e trabalham como representantes comerciais das maiores construtoras de Belo Horizonte e região metropolitana. São mais de 45 construtoras e mais de 250 apartamentos!</p><p>Somos ESPECIALISTAS em apartamentos na planta, no primeiro apartamento e em investimento em apartamento. Nos especializamos neste tipo de imóvel por entendermos que são mais acessíveis para você que quer realizar esse sonho!</p><a href={whatsapp} target="_blank" rel="noreferrer">Anuncie Seu Imóvel</a></div><img src="/site/banner-1.jpg" alt="Equipe FQ Imóveis" /></section>

    <section className="fq-testimonials"><p>DEPOIMENTOS</p><h2>O que os clientes dizem</h2><h3>Atribuímos um grande valor a relacionamentos sólidos. O feedback do cliente é vital para nos ajudar a acertar.</h3><div className="fq-carousel" ref={testimonialsRef}>{testimonials.map((testimonial) => <article key={testimonial.name}><blockquote>“<span>{testimonial.text}</span>”</blockquote><footer><img src={testimonial.photo} alt="" /><strong>{testimonial.name}</strong></footer></article>)}</div><div className="fq-dots"><button type="button" onClick={() => scrollCarousel(testimonialsRef.current, -1)} aria-label="Depoimentos anteriores" /><button type="button" onClick={() => scrollCarousel(testimonialsRef.current, 1)} aria-label="Próximos depoimentos" /><button type="button" onClick={() => scrollCarousel(testimonialsRef.current, 2)} aria-label="Próximos depoimentos" /></div></section>

    <section className="fq-vip"><div><strong>Achar um imóvel pode ser mais fácil...</strong><span>Contrate gratuitamente nossa assessoria vip de busca de imóveis.</span></div><a href={whatsapp} target="_blank" rel="noreferrer">Sim! Acelerar Busca</a></section>

    <section className="fq-channel"><h2>NOSSO CANAL</h2><div className="fq-carousel" ref={videosRef}>{videos.map((video) => <a key={video} href={`https://youtu.be/${video}`} target="_blank" rel="noreferrer"><img src={`https://img.youtube.com/vi/${video}/hqdefault.jpg`} alt="Vídeo do canal FQ Imóveis" /><span>▶</span></a>)}</div><div className="fq-dots"><button type="button" onClick={() => scrollCarousel(videosRef.current, -1)} aria-label="Vídeos anteriores" /><button type="button" onClick={() => scrollCarousel(videosRef.current, 1)} aria-label="Próximos vídeos" /><button type="button" onClick={() => scrollCarousel(videosRef.current, 2)} aria-label="Próximos vídeos" /></div></section>

    <section className="fq-blog" id="blog"><p>BLOG</p><h2>Dicas e notícias para você</h2><h3>Acesse nosso conteúdo para ajudar você a decidir da melhor maneira</h3><div><article><img src="https://fotos.sobressai.com.br/Fotos/Blog/Fotos/2016/594/594.png" alt="Sustentabilidade e qualidade de vida" /><div><time>31/07/2025</time><h4>Sustentabilidade e Qualidade de Vida: Como os Imóveis na Planta Estão Transformando o Futuro</h4><p>A busca por qualidade de vida vai muito além da localização ou da metragem de um apartamento.</p><a href="https://antigo.fqimoveis.com/blog" target="_blank" rel="noreferrer">Leia mais ...</a></div></article><article><div className="fq-blog-placeholder">▧</div><div><time>23/07/2025</time><h4>Porque você deveria escolher a FQ Imóveis?</h4><p>Na FQ Imóveis, você tem várias opções de construtoras e apartamentos diferentes.</p><a href="https://antigo.fqimoveis.com/blog" target="_blank" rel="noreferrer">Leia mais ...</a></div></article></div></section>

    <footer className="fq-footer"><div><h2>CONTATO</h2><p>Rua Cariri, 26</p><p>Nova Suíça - Belo Horizonte</p><p>Email: contato@felipequeiroz.com.br</p><a href={whatsapp} target="_blank" rel="noreferrer">(31) 9626-3003</a></div><div><h2>IMÓVEIS POR TIPO</h2><nav>{propertyTypes.map((type) => <a href="#resultados" key={type}>{type}</a>)}</nav></div><div><h2>IMÓVEIS À VENDA EM</h2><nav>{cities.map((city) => <a href="#resultados" key={city}>{city}</a>)}</nav></div><div className="fq-footer-brand"><Image src="/site/logo.png" width={190} height={74} alt="FQ Imóveis" /><strong>CRECI: 36760</strong></div></footer>

    {menu && <><button className="fq-menu-mask" type="button" onClick={() => setMenu(false)} aria-label="Fechar menu" /><aside className="fq-menu"><button type="button" onClick={() => setMenu(false)} aria-label="Fechar">×</button><Image src="/site/logo.png" width={170} height={65} alt="FQ Imóveis" /><nav><a href="#resultados" onClick={() => setMenu(false)}>Vender imóveis</a><a href="#resultados" onClick={() => setMenu(false)}>Comprar imóveis</a><a href="#blog" onClick={() => setMenu(false)}>Blogs</a><a href="#sobre" onClick={() => setMenu(false)}>Sobre nós</a><a href={whatsapp} target="_blank" rel="noreferrer">Contato</a>{isAdmin ? <><Link href="/admin">Painel IA</Link><Link href="/admin/properties">Adicionar imóvel</Link></> : <Link href="/login">Login</Link>}</nav></aside></>}
  </main>;
}
