"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type User = { id: string; name: string | null; email?: string; role: string; created_at: string };

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "trainee" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) { router.push("/login"); return; }
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => { setUsers(d.users ?? []); setLoading(false); })
      .catch(() => { alert("Erro ao carregar usuários"); setLoading(false); });
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setUsers([{ ...data.user, created_at: new Date().toISOString() }, ...users]);
      setForm({ email: "", password: "", name: "", role: "trainee" });
      alert("Usuário criado!");
    } else {
      alert(data.error || "Erro ao criar usuário");
    }
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p className="eyebrow">Console do diretor</p>
          <h1 style={{ margin: "4px 0 8px" }}>Usuários</h1>
          <p className="lead">Cadastre corretores e trainees para acessar a plataforma.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin" className="button ghost">Voltar</Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 16px" }}>Novo usuário</h2>
        <form onSubmit={create} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Senha (mín. 6 caracteres)" required />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome (opcional)" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="trainee">Trainee (só roleplay)</option>
              <option value="broker">Corretor</option>
              <option value="director">Diretor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="button" style={{ maxWidth: 220 }}>{saving ? "Criando..." : "Criar usuário"}</button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ margin: "0 0 16px" }}>Usuários cadastrados</h2>
        {loading ? <p>Carregando...</p> : users.length === 0 ? <p className="lead">Nenhum usuário ainda.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Nome</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Email</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Perfil</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px 8px" }}>{u.name || "—"}</td>
                  <td style={{ padding: "12px 8px" }}>{u.email || "—"}</td>
                  <td style={{ padding: "12px 8px" }}><span className="eyebrow">{u.role}</span></td>
                  <td style={{ padding: "12px 8px" }}>{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
