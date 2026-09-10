const modules = [
  ["Assistente do corretor", "Respostas sobre processos, vendas e estoque com fontes rastreáveis."],
  ["Atendimento ao cliente", "Qualificação, busca de imóveis e transferência segura para uma pessoa."],
  ["Estoque confiável", "Preço e disponibilidade consultados em dados estruturados, nunca inventados."],
  ["Console do diretor", "Persona, fontes, avaliações e versões publicadas com governança."],
];

export default function Home() {
  return <main>
    <span className="status"><span className="dot" /> Fundação em operação</span>
    <p className="eyebrow">FQ Inteligência Imobiliária</p>
    <h1>Conhecimento que transforma conversa em negócio.</h1>
    <p className="lead">Uma plataforma de agentes de IA criada para apoiar corretores, atender clientes e consultar o estoque da FQ Imóveis com segurança.</p>
    <section className="grid">{modules.map(([title, text]) => <article className="card" key={title}><h2>{title}</h2><p>{text}</p></article>)}</section>
  </main>;
}
