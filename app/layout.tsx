"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./globals.css";

function getToken() {
  if (typeof document === "undefined") return null;
  return document.cookie.match(/sb-access-token=([^;]+)/)?.[1] ?? null;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(getToken);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  function logout() {
    document.cookie = "sb-access-token=; path=/; max-age=0";
    document.cookie = "sb-refresh-token=; path=/; max-age=0";
    setToken(null);
    router.push("/login");
  }

  const isLogin = pathname === "/login";

  useEffect(() => {
    function onChange() { setToken(getToken()); }
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  return <html lang="pt-BR">
    <body>
      {!isLogin && token && (
        <header style={{ position: "sticky", top: 0, zIndex: 40 }}>
          <Link href="/admin"><Image src="/logo-fq.png" alt="FQ Imóveis" width={160} height={48} priority /></Link>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/chat" className="button ghost">Chat</Link>
            <Link href="/academy" className="button ghost">Academy</Link>
            <Link href="/admin" className="button ghost">Treinar</Link>
            <button onClick={logout} className="button">Sair</button>
          </nav>
        </header>
      )}
      {children}
    </body>
  </html>;
}
