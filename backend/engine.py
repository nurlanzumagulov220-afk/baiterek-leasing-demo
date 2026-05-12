# Author: TSP Team, 2026
# Created for Baiterek Hackathon
"""
Leasing Engine — интерпретирует Genesis Atom.
Поддерживает multi-step атомы, вычисляемые поля, аннуитет.
"""

import json
from pathlib import Path
from typing import Any

ATOMS_DIR = Path(__file__).parent / "atoms"


def load_atom(atom_id: str) -> dict[str, Any]:
    path = ATOMS_DIR / f"{atom_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Atom not found: {atom_id}")
    return json.loads(path.read_text())


def list_atoms() -> list[dict]:
    result = []
    for f in sorted(ATOMS_DIR.glob("*.json")):
        try:
            d = json.loads(f.read_text())
            result.append({
                "atom_id": d.get("atom_id", f.stem),
                "product_name": d.get("product_name", ""),
                "category": d.get("category", ""),
                "description": d.get("description", ""),
                "version": d.get("version", "1.0.0"),
            })
        except Exception:
            pass
    return result


def save_atom(atom_id: str, data: dict[str, Any]) -> None:
    path = ATOMS_DIR / f"{atom_id}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def delete_atom(atom_id: str) -> None:
    path = ATOMS_DIR / f"{atom_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Atom not found: {atom_id}")
    path.unlink()


def calc_annuity(principal: float, rate_annual_pct: float, months: int) -> dict[str, Any]:
    r = rate_annual_pct / 100 / 12
    n = months
    if r == 0:
        monthly = principal / n
    else:
        monthly = principal * r * (1 + r) ** n / ((1 + r) ** n - 1)

    total = monthly * n
    overpayment = total - principal

    schedule = []
    balance = principal
    for i in range(1, n + 1):
        interest = balance * r
        body = monthly - interest
        balance -= body
        schedule.append({
            "month": i,
            "payment": round(monthly, 2),
            "body": round(body, 2),
            "interest": round(interest, 2),
            "balance": round(max(balance, 0), 2),
        })

    return {
        "monthly_payment": round(monthly, 2),
        "total_payment": round(total, 2),
        "overpayment": round(overpayment, 2),
        "schedule": schedule,
    }


def calculate(atom_id: str, equipment_cost: float, advance_pct: float, term_months: int) -> dict[str, Any]:
    atom = load_atom(atom_id)
    params = atom["params"]

    advance = equipment_cost * advance_pct / 100
    principal = equipment_cost - advance

    if not (params["min_amount"] <= equipment_cost <= params["max_amount"]):
        raise ValueError(
            f"Стоимость должна быть от {params['min_amount']:,.0f} до {params['max_amount']:,.0f} {params['currency']}"
        )
    if not (params["min_months"] <= term_months <= params["max_months"]):
        raise ValueError(f"Срок должен быть от {params['min_months']} до {params['max_months']} месяцев")
    if not (params["advance_pct_min"] <= advance_pct <= params["advance_pct_max"]):
        raise ValueError(f"Аванс должен быть от {params['advance_pct_min']}% до {params['advance_pct_max']}%")

    result = calc_annuity(principal, params["rate_annual_pct"], term_months)
    return {
        "atom_id": atom_id,
        "product_name": atom["product_name"],
        "input": {
            "equipment_cost": equipment_cost,
            "advance_pct": advance_pct,
            "advance_amount": round(advance, 2),
            "principal": round(principal, 2),
            "term_months": term_months,
            "rate_annual_pct": params["rate_annual_pct"],
            "currency": params["currency"],
        },
        **result,
    }
