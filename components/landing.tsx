"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const preview = [
  ["Senior product engineer", "Stripe", "Remote · US", "94"],
  ["Analytics engineer", "Notion", "New York · Hybrid", "89"],
  ["Staff backend engineer", "Cloudflare", "Austin · Remote", "86"],
];

export function Landing() {
  const reduce = useReducedMotion();
  const rise = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] text-primary-foreground">A</span>
          Applykar
        </Link>
        <nav className="hidden items-center gap-5 text-[13px] text-muted-foreground sm:flex">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
        </nav>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/feed" />}>
            Open feed
          </Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <motion.div {...rise}>
          <p className="text-[12px] uppercase tracking-[0.16em] text-primary">For one person. Not a marketplace.</p>
          <h1 className="mt-3 max-w-xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">
            Apply to the right jobs.
            <span className="mt-1 block text-primary">Skip the ones that waste a click.</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Live roles from company career pages on Greenhouse, Lever, Ashby, SmartRecruiters, and Workable. Fit is scored for the profile you have open. Visa, pay, and relocation answers come only from what you saved.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/feed" />}>
              Open the feed
              <ArrowRight />
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href="#how" />}>
              See how it works
            </Button>
          </div>
        </motion.div>
        <motion.div {...rise} className="rounded-xl border border-border bg-card p-3 shadow-2xl shadow-black/30">
          <div className="mb-2 flex items-center justify-between px-1 text-[12px] text-muted-foreground">
            <span>Preview</span>
            <span>Match</span>
          </div>
          <div className="grid gap-2">
            {preview.map(([title, company, meta, score]) => (
              <div key={title} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {company} · {meta}
                  </p>
                </div>
                <span className="text-sm text-primary">{score}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
      <section id="product" className="mx-auto grid max-w-6xl gap-3 px-4 pb-8 sm:grid-cols-3">
        {[
          ["Only roles that fit", "Director and VP roles stay hidden until you ask. W-2-only posts drop when a profile prefers C2C."],
          ["Proof, not a guess", "Queue a role, copy the answers you already saved, then attach the confirmation when you mark it applied."],
          ["Your network stays yours", "Applykar reads public career pages. It does not touch LinkedIn or Indeed."],
        ].map(([title, body]) => (
          <article key={title} className="rounded-xl border border-border p-4">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>
      <section id="how" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-sm font-medium">Three steps, then the feed</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {["Sign in with the Google account on your allowlist.", "Upload a resume. Applykar reads skills, titles, and years into a profile.", "Pick interests and locations. Matching, the queue, and saved answers stay on that profile."].map((step, index) => (
            <li key={step} className="rounded-xl border border-border p-4 text-[13px] text-muted-foreground">
              <span className="mb-2 block text-[12px] text-primary">0{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <section id="security" className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-16 sm:flex-row">
        <div className="flex flex-1 gap-3 rounded-xl border border-border p-4">
          <Shield className="mt-0.5 size-4 text-primary" />
          <p className="text-[13px] text-muted-foreground">Owner-only Google sign-in. Anyone else, even with a Google account, is turned away.</p>
        </div>
        <div className="flex flex-1 gap-3 rounded-xl border border-border p-4">
          <Sparkles className="mt-0.5 size-4 text-primary" />
          <p className="text-[13px] text-muted-foreground">Up to five profiles. Each one has its own resume, interests, locations, and apply queue.</p>
        </div>
      </section>
    </div>
  );
}
