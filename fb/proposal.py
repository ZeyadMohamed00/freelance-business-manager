"""AI proposal feature. With OPENAI_API_KEY an LLM drafts the text (written, NOT run: no key here).
Without a key a deterministic TEMPLATE drafts it. The response says which one was used."""

import os


def draft(
    client: str, project: str, scope: str, budget: float | None, hourly: float | None
) -> dict:
    if os.getenv("OPENAI_API_KEY"):  # pragma: no cover
        import httpx

        r = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            timeout=60,
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
            json={
                "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
                "temperature": 0.4,
                "messages": [
                    {
                        "role": "system",
                        "content": "Write a concise, professional freelance project proposal. Do not invent facts beyond the input.",
                    },
                    {
                        "role": "user",
                        "content": f"Client: {client}\nProject: {project}\nScope: {scope}\nBudget: {budget}\nHourly rate: {hourly}",
                    },
                ],
            },
        )
        r.raise_for_status()
        return {"mode": "llm", "text": r.json()["choices"][0]["message"]["content"]}
    items = [
        s.strip(" -*\t") for s in scope.replace(";", "\n").split("\n") if s.strip(" -*\t")
    ] or [scope]
    lines = [
        f"Proposal: {project}",
        f"Prepared for: {client}",
        "",
        "Overview",
        f"I will deliver {project} for {client}, covering the scope below.",
        "",
        "Scope",
    ]
    lines += [f"{i + 1}. {s}" for i, s in enumerate(items)]
    lines += ["", "Pricing"]
    if budget:
        lines.append(
            f"Fixed fee: {budget:,.2f}, based on the scope above. Changes to the scope are quoted separately."
        )
    elif hourly:
        lines.append(
            f"Hourly rate: {hourly:,.2f}. Hours are tracked and invoiced against the scope above."
        )
    else:
        lines.append("Pricing to be agreed.")
    lines += [
        "",
        "Next steps",
        "Reply to confirm, and I will send a quote and schedule the kickoff.",
    ]
    return {"mode": "template (no LLM key configured)", "text": "\n".join(lines)}
