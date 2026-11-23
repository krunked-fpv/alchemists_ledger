"""Deterministic weekly live-ops festival payload generator for Alchemists Ledger.

Uses only the Python 3 standard library and seeds generation deterministically
from the current UTC ISO year-week (e.g. ``2026-W48``) to write
``public/data/festivals.json`` conforming strictly to ``FestivalPayloadV1``.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
from typing import Any

SCHEMA_VERSION = 1

CANONICAL_REAGENT_ORDER: tuple[str, ...] = (
    "amber_honey_resin",
    "cinnabar_sulfur_ash",
    "bismuth_vitriol_salt",
    "glacial_alum_shard",
    "chalk_pearl_lime",
    "verdigris_moss_sap",
    "saffron_hearth_pollen",
    "cobalt_lotus_nectar",
    "moonveil_lichen_dew",
    "rose_madder_distillate",
    "auric_mica_suspension",
    "starlight_aether_oil",
)

ENVOY_ARCHETYPES: tuple[str, ...] = (
    "singed_warden",
    "guild_loupe_connoisseur",
    "rain_soaked_herbalist",
    "frostbitten_courier",
    "starfall_astronomer",
    "iron_miner_factor",
    "court_chirurgeon",
    "wandering_bard_peddler",
)

MARKET_REGIMES: tuple[str, ...] = (
    "calm",
    "dragon_siege",
    "bumper_harvest",
    "glacial_snap",
    "starfall_conclave",
)

POTION_EFFECTS: tuple[str, ...] = (
    "fire_ward",
    "burn_salve",
    "hearth_tonic",
    "galaxy_elixir",
    "neutralizing_salve",
    "soothing_draught",
)

MIN_ELASTICITY = 0.55
MAX_ELASTICITY = 1.85

REGIME_FESTIVALS: dict[str, list[tuple[str, str]]] = {
    "calm": [
        (
            "Lantern Guild Inspection Week",
            "Sunlit brass bells chime calmly along the canal as Guild assessors appraise crisp horizons and clean-necked crystal. Steady caravan routes keep raw stock plentiful across every shelf.",
        ),
        (
            "Ambergris & Parchment Fair",
            "Scribes, collectors, and wandering bards gather beneath clear stained glass to trade measured draughts. Even-tempered demand rewards careful preparation over haste.",
        ),
    ],
    "dragon_siege": [
        (
            "Ashen Rampart Vigil",
            "Scorched watch-banners flutter beyond the city gate while wardens queue for ember-shielding phials and burn unguents. Sulfurous minerals trade dear as mine shafts stay shuttered.",
        ),
        (
            "Cinder-Watch Conscription",
            "Smoke-stained couriers ride in from the basalt ridge seeking heat-tempered wards and cooling salves. Every crucible runs hot while Guild chirurgeons bid sharply for purity.",
        ),
    ],
    "bumper_harvest": [
        (
            "Verdant Sickle & Still Jubilee",
            "Overflowing herb carts crowd the cobblestone square after seven days of silver rain, flooding the market with fresh botanicals. Cellar condensers sing as apothecaries refine surplus sap into high-margin elixirs.",
        ),
        (
            "Rain-Wash Botanical Equinox",
            "Damp moss, lotus nectar, and rose petals spill from wicker hampers at bargain coin. Discerning buyers still pay handsomely for layered clarity over raw bulk.",
        ),
    ],
    "glacial_snap": [
        (
            "Rime-Pane Hearth Conclave",
            "Frost ferns creep across the leaded shopfront while shivering riders barter briskly for spiced hearth tonics. High-viscosity resins thicken fast in the cold, testing steady bellows craft.",
        ),
        (
            "Silver-Frost Solstice Market",
            "Ice-rimmed barges lock along the wharf, turning saffron pollen and honeyed draughts into prized comfort. Warmed crucibles and disciplined temperature peaks command the guild premium.",
        ),
    ],
    "starfall_conclave": [
        (
            "Celestial Prism & Mica Conclave",
            "Violet aurora ribbons drape the night sky as astronomers and glass-loupe collectors seek suspended starlight elixirs. Rare iridescent oils surge in value for flawless multi-layer brilliance.",
        ),
        (
            "Astral Meridian Exhibition",
            "Telescopes line the Guild roof while patrons inspect refracted indigo horizons through faceted crystal. Precision density stacking without turbid boil-over wins the Grandmaster purse.",
        ),
    ],
}

REGIME_ELASTICITY_BASES: dict[str, dict[str, float]] = {
    "calm": {
        "amber_honey_resin": 1.00,
        "cinnabar_sulfur_ash": 1.02,
        "bismuth_vitriol_salt": 0.98,
        "glacial_alum_shard": 1.00,
        "chalk_pearl_lime": 0.96,
        "verdigris_moss_sap": 0.98,
        "saffron_hearth_pollen": 1.04,
        "cobalt_lotus_nectar": 1.02,
        "moonveil_lichen_dew": 1.00,
        "rose_madder_distillate": 0.98,
        "auric_mica_suspension": 1.08,
        "starlight_aether_oil": 1.06,
    },
    "dragon_siege": {
        "amber_honey_resin": 1.15,
        "cinnabar_sulfur_ash": 1.62,
        "bismuth_vitriol_salt": 1.54,
        "glacial_alum_shard": 1.42,
        "chalk_pearl_lime": 1.18,
        "verdigris_moss_sap": 1.22,
        "saffron_hearth_pollen": 1.08,
        "cobalt_lotus_nectar": 0.94,
        "moonveil_lichen_dew": 1.24,
        "rose_madder_distillate": 0.92,
        "auric_mica_suspension": 0.88,
        "starlight_aether_oil": 0.86,
    },
    "bumper_harvest": {
        "amber_honey_resin": 0.82,
        "cinnabar_sulfur_ash": 1.08,
        "bismuth_vitriol_salt": 1.06,
        "glacial_alum_shard": 1.04,
        "chalk_pearl_lime": 0.96,
        "verdigris_moss_sap": 0.64,
        "saffron_hearth_pollen": 0.68,
        "cobalt_lotus_nectar": 0.66,
        "moonveil_lichen_dew": 0.65,
        "rose_madder_distillate": 0.67,
        "auric_mica_suspension": 1.16,
        "starlight_aether_oil": 1.12,
    },
    "glacial_snap": {
        "amber_honey_resin": 1.38,
        "cinnabar_sulfur_ash": 1.24,
        "bismuth_vitriol_salt": 1.06,
        "glacial_alum_shard": 0.72,
        "chalk_pearl_lime": 0.94,
        "verdigris_moss_sap": 1.14,
        "saffron_hearth_pollen": 1.58,
        "cobalt_lotus_nectar": 1.12,
        "moonveil_lichen_dew": 0.88,
        "rose_madder_distillate": 1.44,
        "auric_mica_suspension": 1.05,
        "starlight_aether_oil": 1.18,
    },
    "starfall_conclave": {
        "amber_honey_resin": 0.95,
        "cinnabar_sulfur_ash": 0.92,
        "bismuth_vitriol_salt": 1.10,
        "glacial_alum_shard": 1.14,
        "chalk_pearl_lime": 0.92,
        "verdigris_moss_sap": 0.94,
        "saffron_hearth_pollen": 1.04,
        "cobalt_lotus_nectar": 1.48,
        "moonveil_lichen_dew": 1.44,
        "rose_madder_distillate": 1.06,
        "auric_mica_suspension": 1.66,
        "starlight_aether_oil": 1.72,
    },
}

REGIME_ENVOY_BASES: dict[str, dict[str, float]] = {
    "calm": {
        "singed_warden": 0.95,
        "guild_loupe_connoisseur": 1.30,
        "rain_soaked_herbalist": 1.15,
        "frostbitten_courier": 0.95,
        "starfall_astronomer": 1.00,
        "iron_miner_factor": 1.10,
        "court_chirurgeon": 1.15,
        "wandering_bard_peddler": 1.35,
    },
    "dragon_siege": {
        "singed_warden": 2.25,
        "guild_loupe_connoisseur": 0.90,
        "rain_soaked_herbalist": 0.75,
        "frostbitten_courier": 0.65,
        "starfall_astronomer": 0.70,
        "iron_miner_factor": 1.55,
        "court_chirurgeon": 1.85,
        "wandering_bard_peddler": 0.85,
    },
    "bumper_harvest": {
        "singed_warden": 0.75,
        "guild_loupe_connoisseur": 1.25,
        "rain_soaked_herbalist": 2.15,
        "frostbitten_courier": 0.80,
        "starfall_astronomer": 1.05,
        "iron_miner_factor": 0.95,
        "court_chirurgeon": 1.20,
        "wandering_bard_peddler": 1.65,
    },
    "glacial_snap": {
        "singed_warden": 0.80,
        "guild_loupe_connoisseur": 1.15,
        "rain_soaked_herbalist": 0.90,
        "frostbitten_courier": 2.30,
        "starfall_astronomer": 1.15,
        "iron_miner_factor": 1.35,
        "court_chirurgeon": 1.40,
        "wandering_bard_peddler": 1.05,
    },
    "starfall_conclave": {
        "singed_warden": 0.65,
        "guild_loupe_connoisseur": 1.95,
        "rain_soaked_herbalist": 0.95,
        "frostbitten_courier": 0.85,
        "starfall_astronomer": 2.35,
        "iron_miner_factor": 0.80,
        "court_chirurgeon": 1.00,
        "wandering_bard_peddler": 1.25,
    },
}

COMMISSION_TEMPLATES: dict[str, dict[str, list[dict[str, Any]]]] = {
    "apprentice": {
        "calm": [
            {
                "title": "Amber-Moss Soothing Measure",
                "description": "Float verdigris moss sap above dense amber honey resin with two clean strata and gentle bellows warmth.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "rewardCrowns": 48,
            },
            {
                "title": "Balanced Chalk Neutralizer",
                "description": "Pair bismuth vitriol salt with chalk pearl lime to tame excess acidity across two distinct horizons.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.56,
                "minPurity": 0.68,
                "targetPh": [5.5, 8.5],
                "rewardCrowns": 52,
            },
        ],
        "dragon_siege": [
            {
                "title": "Garrison Burn Unguent",
                "description": "Combine glacial alum shard and verdigris moss sap to deliver a cool two-layer burn salve for rampart scouts.",
                "requiredEffect": "burn_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "rewardCrowns": 54,
            },
        ],
        "bumper_harvest": [
            {
                "title": "Orchard Dew Soothing Vial",
                "description": "Suspend sliced botanicals over amber honey resin without muddying the interface.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "rewardCrowns": 46,
            },
        ],
        "glacial_snap": [
            {
                "title": "Courier Hearth Draught",
                "description": "Warm saffron hearth pollen with rose madder distillate past 48 C without scorching the vessel.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "minPeakTempC": 48.0,
                "rewardCrowns": 54,
            },
        ],
        "starfall_conclave": [
            {
                "title": "First-Light Starlight Phial",
                "description": "Layer cobalt lotus nectar beneath starlight aether oil to catch clear dusk refraction.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "rewardCrowns": 56,
            },
        ],
    },
    "journeyman": {
        "calm": [
            {
                "title": "Guild Chirurgeon Neutralizing Triplet",
                "description": "Stack three well-prepared layers centering pH between 6.0 and 8.0 for field dressing safety.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "targetPh": [6.0, 8.0],
                "rewardCrowns": 96,
            },
            {
                "title": "Warm Saffron Hearth Infusion",
                "description": "Hold three crisp botanical-resin strata while raising cauldron peak heat above 56 C.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "minPeakTempC": 56.0,
                "rewardCrowns": 98,
            },
        ],
        "dragon_siege": [
            {
                "title": "Vanguard Fire-Ward Suspension",
                "description": "Hold cinnabar sulfur ash, bismuth vitriol, and saffron pollen in three crisp layers above 62 C.",
                "requiredEffect": "fire_ward",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "minPeakTempC": 62.0,
                "rewardCrowns": 108,
            },
        ],
        "bumper_harvest": [
            {
                "title": "Triple-Horizon Botanical Salve",
                "description": "Refine fresh moss sap, lichen dew, and glacial alum into a pH-balanced burn salve of high clarity.",
                "requiredEffect": "burn_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.80,
                "targetPh": [5.8, 8.4],
                "rewardCrowns": 94,
            },
        ],
        "glacial_snap": [
            {
                "title": "Hearth-Ember Saffron Tonic",
                "description": "Drive peak temperature above 64 C across three distinct horizons while keeping pH gentle.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [5.5, 8.2],
                "minPeakTempC": 64.0,
                "rewardCrowns": 106,
            },
        ],
        "starfall_conclave": [
            {
                "title": "Three-Tier Astral Conclave Elixir",
                "description": "Suspend cobalt lotus, moonveil dew, and auric mica in razor-crisp density tiers.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 3,
                "minLayerCrispness": 0.76,
                "minPurity": 0.80,
                "targetPh": [6.0, 8.8],
                "rewardCrowns": 112,
            },
        ],
    },
    "grandmaster": {
        "calm": [
            {
                "title": "Grandmaster Four-Strata Galaxy Prism",
                "description": "Assemble four spotless specific-gravity layers below critical shear with neutral-alkaline poise and gentle warmth.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.88,
                "targetPh": [6.2, 8.8],
                "minPeakTempC": 44.0,
                "rewardCrowns": 185,
            },
        ],
        "dragon_siege": [
            {
                "title": "Crucible-Tempered Bastion Ward",
                "description": "Hold four razor-crisp strata through 68 C peak heat without triggering boil-over or pH scorch.",
                "requiredEffect": "fire_ward",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [4.2, 7.6],
                "minPeakTempC": 68.0,
                "rewardCrowns": 205,
            },
        ],
        "bumper_harvest": [
            {
                "title": "Quintessence Neutralizing Sovereign",
                "description": "Balance four crystal and cellar-distilled strata into an exact neutral pH window with zero turbidity.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [6.4, 7.8],
                "rewardCrowns": 190,
            },
        ],
        "glacial_snap": [
            {
                "title": "Solstice Hearth-Core Reserve",
                "description": "Marry four stratified layers past 70 C peak hearth temperature while preserving crisp viscosity horizons.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [5.6, 8.2],
                "minPeakTempC": 70.0,
                "rewardCrowns": 200,
            },
        ],
        "starfall_conclave": [
            {
                "title": "Zenith Nebula Collector Crown",
                "description": "Achieve four luminous strata of auric mica and starlight oil at peak purity for Guild exhibition.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.86,
                "minPurity": 0.90,
                "targetPh": [6.4, 9.0],
                "rewardCrowns": 215,
            },
        ],
    },
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def get_utc_iso_year_week(now: datetime | None = None) -> str:
    dt = now if now is not None else datetime.now(timezone.utc)
    iso_cal = dt.isocalendar()
    return f"{iso_cal.year}-W{iso_cal.week:02d}"


def seed_for_iso_week(iso_year_week: str) -> int:
    digest = hashlib.sha256(iso_year_week.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def build_festival_payload(iso_year_week: str) -> dict[str, Any]:
    rng = random.Random(seed_for_iso_week(iso_year_week))

    regime = MARKET_REGIMES[rng.randrange(len(MARKET_REGIMES))]
    festival_pool = REGIME_FESTIVALS[regime]
    festival_name, lore_note = festival_pool[rng.randrange(len(festival_pool))]

    reagent_modifiers: dict[str, float] = {}
    base_elasticities = REGIME_ELASTICITY_BASES[regime]
    for reagent_id in CANONICAL_REAGENT_ORDER:
        jitter = rng.uniform(-0.10, 0.10)
        val = clamp(base_elasticities[reagent_id] + jitter, MIN_ELASTICITY, MAX_ELASTICITY)
        reagent_modifiers[reagent_id] = round(val, 2)

    envoy_weights: dict[str, float] = {}
    base_envoys = REGIME_ENVOY_BASES[regime]
    for archetype_id in ENVOY_ARCHETYPES:
        jitter = rng.uniform(-0.14, 0.14)
        val = clamp(base_envoys[archetype_id] + jitter, 0.35, 2.50)
        envoy_weights[archetype_id] = round(val, 2)

    commissions: list[dict[str, Any]] = []
    for tier in ("apprentice", "journeyman", "grandmaster"):
        pool = COMMISSION_TEMPLATES[tier][regime]
        chosen = dict(pool[rng.randrange(len(pool))])
        commission: dict[str, Any] = {
            "id": f"comm-{iso_year_week.lower()}-{tier}",
            "tier": tier,
            "title": chosen["title"],
            "description": chosen["description"],
            "requiredEffect": chosen["requiredEffect"],
            "minLayers": int(chosen["minLayers"]),
            "minLayerCrispness": round(float(chosen["minLayerCrispness"]), 2),
            "minPurity": round(float(chosen["minPurity"]), 2),
            "rewardCrowns": int(chosen["rewardCrowns"]) + rng.randint(-3, 5),
        }
        if "targetPh" in chosen:
            commission["targetPh"] = [
                round(float(chosen["targetPh"][0]), 2),
                round(float(chosen["targetPh"][1]), 2),
            ]
        if "minPeakTempC" in chosen:
            commission["minPeakTempC"] = round(float(chosen["minPeakTempC"]), 1)
        commissions.append(commission)

    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "isoYearWeek": iso_year_week,
        "festivalName": festival_name,
        "regime": regime,
        "loreNote": lore_note,
        "reagentElasticityModifiers": reagent_modifiers,
        "envoyBiasWeights": envoy_weights,
        "commissions": commissions,
    }
    validate_payload(payload)
    return payload


def validate_payload(payload: dict[str, Any]) -> None:
    if payload.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must equal 1")
    if payload.get("regime") not in MARKET_REGIMES:
        raise ValueError(f"Invalid regime: {payload.get('regime')}")

    reagents = payload.get("reagentElasticityModifiers", {})
    if tuple(reagents.keys()) != CANONICAL_REAGENT_ORDER:
        raise ValueError("reagentElasticityModifiers must contain all 12 canonical reagents")
    for reagent_id, mult in reagents.items():
        if not isinstance(mult, (int, float)) or not (MIN_ELASTICITY <= mult <= MAX_ELASTICITY):
            raise ValueError(f"Elasticity out of bounds for {reagent_id}: {mult}")

    envoys = payload.get("envoyBiasWeights", {})
    if tuple(envoys.keys()) != ENVOY_ARCHETYPES:
        raise ValueError("envoyBiasWeights must contain all 8 envoy archetypes")
    for archetype_id, weight in envoys.items():
        if not isinstance(weight, (int, float)) or weight <= 0:
            raise ValueError(f"Envoy weight must be positive for {archetype_id}: {weight}")

    commissions = payload.get("commissions", [])
    if len(commissions) != 3:
        raise ValueError("commissions must contain exactly 3 items")
    expected_tiers = ["apprentice", "journeyman", "grandmaster"]
    if [c.get("tier") for c in commissions] != expected_tiers:
        raise ValueError("commissions must match [apprentice, journeyman, grandmaster] tiers")
    for c in commissions:
        if c.get("requiredEffect") not in POTION_EFFECTS:
            raise ValueError(f"Invalid requiredEffect: {c.get('requiredEffect')}")


def main() -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    output_path = repo_root / "public" / "data" / "festivals.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    iso_year_week = get_utc_iso_year_week()
    payload = build_festival_payload(iso_year_week)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return output_path


if __name__ == "__main__":
    written = main()
    print(f"Synced weekly festival payload to {written}")
