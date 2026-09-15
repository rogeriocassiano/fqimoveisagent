"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    const role = document.cookie.match(/sb-role=([^;]+)/)?.[1];
    if (token) router.push(role === "trainee" ? "/academy" : "/admin");
  }, [router]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok && data.access_token) {
      document.cookie = `sb-access-token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`;
      document.cookie = `sb-refresh-token=${data.refresh_token}; path=/; max-age=${60 * 60 * 24 * 7}`;
      document.cookie = `sb-role=${data.role}; path=/; max-age=${60 * 60 * 24 * 7}`;
      router.push(data.role === "trainee" ? "/academy" : "/admin");
    } else {
      setError(data.error || "Erro ao fazer login");
    }
  }

  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <section className="card" style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <Image src="/logo-fq.png" alt="FQ Imóveis" width={160} height={48} priority style={{ marginBottom: 24 }} />
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Painel de Controle</h1>
        <p className="lead" style={{ fontSize: ".95rem" }}>Acesso exclusivo para diretoria e gestão.</p>
        <form onSubmit={login} style={{ marginTop: 24 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Senha" required />
          {error && <p style={{ color: "#ff6b6b", fontSize: ".9rem" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%" }}>{loading ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
