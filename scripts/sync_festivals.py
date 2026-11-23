"""Deterministic weekly live-ops festival payload generator for Alchemists Ledger.

Uses only the Python 3 standard library and seeds generation deterministically
from the current UTC ISO year-week (e.g. ``2026-W48``) to write
``public/data/festivals.json`` conforming strictly to ``FestivalPayloadV1``.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import random
from typing import Any

SCHEMA_VERSION = 1
ANCHOR_ISO_MONDAY = date.fromisocalendar(2020, 1, 1)

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
        (
            "Canal-Glass Guild Promenade",
            "Barge lanterns drift gently past leaded-glass shopfronts as apothecaries trade clear density towers and balanced tinctures. Open shipping lanes keep every crystal and botanical tray evenly priced.",
        ),
        (
            "Vellum & Brass Equilibrium Fair",
            "Inspectors calibrate shopfront balance pans while collectors browse sunlit shelves for crisp multi-strata phials. Tranquil weather brings steady footfall and measured haggling across all tiers.",
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
        (
            "Basalt Bastion Quenchers' Muster",
            "Ember-scarred standard-bearers knock on oak counters for heat-shields and blistering salves before the night sortie. Sulfur-rich minerals command wartime coin while caravans hug the tunnel roads.",
        ),
        (
            "Wyrm-Smoke Apothecary Levy",
            "Ash drifts across the skylight as siege chirurgeons requisition high-temperature fire wards and cooling alum unguents. Steady nerves at the bellows win generous garrison bounties.",
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
        (
            "Copper-Still Orchard Overflow",
            "Sweet-smelling moss, pollen, and crushed petals heap the market stalls at half their winter toll. Savvy distillers turn cheap botanical abundance into disciplined, high-purity blends.",
        ),
        (
            "Silver-Furrow Herbwright Gala",
            "Wain-loads of dewy lichen and crimson madder roots roll past the canal lock after seven warm showers. Buyers shrug off common brews yet bid briskly for sharp, multi-horizon craft.",
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
        (
            "Hoarfrost Courier Relay",
            "Icicles fringe the brass eaves as frost-rimed post riders crowd the hearth for warming saffron tonics and comforting draughts. Cold ambient cauldrons demand resolute bellows work to hit peak extraction.",
        ),
        (
            "Frozen Lock & Amber Hearth-Week",
            "Sledges glide over the white canal while merchants barter furiously for high-proof hearth infusions and soothing oils. Thickening resins reward clean gentle stirring below critical shear.",
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
        (
            "Meteor-Veil Collectors' Salon",
            "Twin comet trails shimmer behind the skylight as loupe-toting patrons bid fiercely for suspended gold mica and indigo aether. Every stray fold or hazy meniscus draws immediate scrutiny.",
        ),
        (
            "Orrery & Prism Twilight Soiree",
            "Astronomers bring velvet-lined cases to inspect faceted decanters filled with stratified nebula oils. High-purity layering without thermal scorch unlocks top-tier patronage.",
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
                "description": "Float verdigris moss sap above dense amber honey resin in a prism flask with two clean strata and gentle bellows warmth.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "rewardCrowns": 48,
            },
            {
                "title": "Balanced Chalk Neutralizer",
                "description": "Pair bismuth vitriol salt with chalk pearl lime to tame excess acidity across two distinct specific-gravity horizons.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.56,
                "minPurity": 0.68,
                "targetPh": [5.5, 8.5],
                "rewardCrowns": 52,
            },
            {
                "title": "Canal-Breeze Hearth Draught",
                "description": "Layer saffron hearth pollen over rose madder distillate in a teardrop phial, warming past 46 C with calm laminar stirring.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.69,
                "minPeakTempC": 46.0,
                "rewardCrowns": 54,
            },
            {
                "title": "Dusk-Lotus Prism Suspension",
                "description": "Settle cobalt lotus nectar beneath starlight aether oil inside a faceted prism vessel without folding the meniscus.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "targetPh": [6.5, 9.2],
                "rewardCrowns": 56,
            },
        ],
        "dragon_siege": [
            {
                "title": "Garrison Burn Unguent",
                "description": "Combine glacial alum shard and verdigris moss sap to deliver a cool two-layer burn salve in a sturdy carafe for rampart scouts.",
                "requiredEffect": "burn_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "rewardCrowns": 54,
            },
            {
                "title": "Ember-Sentry Fire Ward",
                "description": "Bind cinnabar sulfur ash beneath saffron hearth pollen and push peak heat past 50 C to temper a patrol-grade fire ward.",
                "requiredEffect": "fire_ward",
                "minLayers": 2,
                "minLayerCrispness": 0.57,
                "minPurity": 0.68,
                "targetPh": [3.8, 7.2],
                "minPeakTempC": 50.0,
                "rewardCrowns": 58,
            },
            {
                "title": "Ash-Trench Acid Neutralizer",
                "description": "Buffer heavy bismuth vitriol salt with chalk pearl lime across two crisp strata so battlefield dressings stay near neutral pH.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.69,
                "targetPh": [5.8, 8.2],
                "rewardCrowns": 53,
            },
            {
                "title": "Watchfire Soothing Honey-Draft",
                "description": "Float soothing rose madder distillate above amber honey resin in a crescent flask to ease smoke-rasped throats.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.59,
                "minPurity": 0.70,
                "targetPh": [4.8, 7.6],
                "rewardCrowns": 51,
            },
        ],
        "bumper_harvest": [
            {
                "title": "Orchard Dew Soothing Vial",
                "description": "Suspend sliced verdigris moss sap over dense amber honey resin in a teardrop vial without muddying the boundary.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "rewardCrowns": 46,
            },
            {
                "title": "Fresh-Cut Alum Burn Poultice",
                "description": "Stack crushed glacial alum shard beneath moonveil lichen dew for a crisp two-horizon cooling salve.",
                "requiredEffect": "burn_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.59,
                "minPurity": 0.69,
                "targetPh": [5.4, 8.6],
                "rewardCrowns": 49,
            },
            {
                "title": "Rain-Press Saffron Cordial",
                "description": "Steep sliced saffron hearth pollen above amber honey resin past 45 C while guarding the density interface from excessive shear.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "minPeakTempC": 45.0,
                "rewardCrowns": 50,
            },
            {
                "title": "Meadow-Lime Buffer Phial",
                "description": "Balance verdigris moss sap against chalk pearl lime in a wide carafe, holding pH smoothly within the guild neutral band.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "targetPh": [6.0, 8.2],
                "rewardCrowns": 52,
            },
        ],
        "glacial_snap": [
            {
                "title": "Rime-Gate Soothing Syrup",
                "description": "Layer viscous amber honey resin below cobalt lotus nectar in a teardrop flask with gentle laminar turns to prevent shear blur.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "targetPh": [5.0, 7.8],
                "rewardCrowns": 52,
            },
            {
                "title": "Frostbite Alum Recovery Salve",
                "description": "Suspend verdigris moss sap over ground glacial alum shard in a crescent bottle to calm frost-chapped skin.",
                "requiredEffect": "burn_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.59,
                "minPurity": 0.69,
                "targetPh": [5.4, 8.4],
                "rewardCrowns": 53,
            },
            {
                "title": "Courier Hearth Draught",
                "description": "Warm saffron hearth pollen with rose madder distillate past 48 C without scorching the vessel, preserving two crisp thermal strata.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 2,
                "minLayerCrispness": 0.58,
                "minPurity": 0.68,
                "minPeakTempC": 48.0,
                "rewardCrowns": 54,
            },
            {
                "title": "Bellows-Primed Cinder Ward",
                "description": "Ignite cinnabar sulfur ash under saffron hearth pollen past 52 C in a heavy carafe to warm frozen watch-posts.",
                "requiredEffect": "fire_ward",
                "minLayers": 2,
                "minLayerCrispness": 0.57,
                "minPurity": 0.68,
                "minPeakTempC": 52.0,
                "rewardCrowns": 57,
            },
        ],
        "starfall_conclave": [
            {
                "title": "First-Light Starlight Phial",
                "description": "Layer cobalt lotus nectar beneath starlight aether oil inside a faceted prism to catch clear dusk refraction.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "rewardCrowns": 56,
            },
            {
                "title": "Twilight Lichen Soothing Flask",
                "description": "Float cobalt lotus nectar cleanly over amber honey resin in a crescent decanter for late-night observatory guests.",
                "requiredEffect": "soothing_draught",
                "minLayers": 2,
                "minLayerCrispness": 0.60,
                "minPurity": 0.70,
                "targetPh": [5.4, 8.0],
                "rewardCrowns": 54,
            },
            {
                "title": "Comet-Warmth Saffron Elixir",
                "description": "Warm saffron hearth pollen below starlight aether oil past 46 C so roof astronomers stay steady in the night breeze.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 2,
                "minLayerCrispness": 0.59,
                "minPurity": 0.69,
                "minPeakTempC": 46.0,
                "rewardCrowns": 55,
            },
            {
                "title": "Astral Slate pH Calibrator",
                "description": "Stabilize bismuth vitriol salt with chalk pearl lime across two crisp crystal horizons for optical glass-loupe testing.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 2,
                "minLayerCrispness": 0.61,
                "minPurity": 0.71,
                "targetPh": [6.2, 8.0],
                "rewardCrowns": 58,
            },
        ],
    },
    "journeyman": {
        "calm": [
            {
                "title": "Guild Chirurgeon Neutralizing Triplet",
                "description": "Stack three well-prepared layers centering pH between 6.0 and 8.0 in a prism bottle for field dressing safety.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "targetPh": [6.0, 8.0],
                "rewardCrowns": 96,
            },
            {
                "title": "Warm Saffron Hearth Infusion",
                "description": "Hold three crisp botanical-resin strata while raising cauldron peak heat above 56 C with disciplined bellows control.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "minPeakTempC": 56.0,
                "rewardCrowns": 98,
            },
            {
                "title": "Canal-Assay Cooling Burn Triplet",
                "description": "Order glacial alum shard, verdigris moss sap, and moonveil lichen dew by descending specific gravity across three clear tiers.",
                "requiredEffect": "burn_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.79,
                "targetPh": [5.6, 8.4],
                "rewardCrowns": 95,
            },
            {
                "title": "Velvet Honey & Rose Soothing Trio",
                "description": "Suspend verdigris moss sap and rose madder distillate above amber honey resin in a teardrop vessel with minimal marbling.",
                "requiredEffect": "soothing_draught",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [5.2, 7.6],
                "rewardCrowns": 94,
            },
        ],
        "dragon_siege": [
            {
                "title": "Vanguard Fire-Ward Suspension",
                "description": "Hold cinnabar sulfur ash, bismuth vitriol, and saffron pollen in three crisp layers above 62 C for front-line shieldbearers.",
                "requiredEffect": "fire_ward",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.78,
                "minPeakTempC": 62.0,
                "rewardCrowns": 108,
            },
            {
                "title": "Rampart Tri-Strata Burn Salve",
                "description": "Stack cinnabar sulfur ash, glacial alum shard, and moonveil lichen dew so cooling botanicals crown the scorched mineral base.",
                "requiredEffect": "burn_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.79,
                "targetPh": [5.0, 8.2],
                "rewardCrowns": 104,
            },
            {
                "title": "Siege-Sapper Ember Tonic",
                "description": "Decant amber honey resin, saffron hearth pollen, and rose madder distillate into a crescent flask above 60 C peak temperature.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [5.4, 8.0],
                "minPeakTempC": 60.0,
                "rewardCrowns": 102,
            },
            {
                "title": "Trench-Buffer Tri-Horizon Salve",
                "description": "Neutralize acidic bismuth vitriol salt with chalk pearl lime and glacial alum across three crisp horizons for burn-ward triage.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.80,
                "targetPh": [6.1, 7.9],
                "rewardCrowns": 100,
            },
        ],
        "bumper_harvest": [
            {
                "title": "Triple-Horizon Botanical Salve",
                "description": "Refine fresh moss sap, lichen dew, and glacial alum into a pH-balanced burn salve of high clarity inside a carafe.",
                "requiredEffect": "burn_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.80,
                "targetPh": [5.8, 8.4],
                "rewardCrowns": 94,
            },
            {
                "title": "Harvest Tide Soothing Triplet",
                "description": "Float sliced verdigris moss sap and pipette-dropped cobalt lotus nectar over raw amber honey resin with razor-sharp interfaces.",
                "requiredEffect": "soothing_draught",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.80,
                "targetPh": [5.4, 7.8],
                "rewardCrowns": 92,
            },
            {
                "title": "Dew-Refined Nebula Trio",
                "description": "Stack cobalt lotus nectar, moonveil lichen dew, and starlight aether oil into three luminous botanical layers.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 3,
                "minLayerCrispness": 0.76,
                "minPurity": 0.80,
                "targetPh": [6.4, 9.0],
                "rewardCrowns": 104,
            },
            {
                "title": "Orchard-Alkali Tri-Layer Buffer",
                "description": "Pair chalk pearl lime, bismuth vitriol salt, and rose madder distillate in a prism vessel tuned tightly around neutral pH.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [6.2, 7.8],
                "rewardCrowns": 96,
            },
        ],
        "glacial_snap": [
            {
                "title": "Ice-Lock Saffron-Honey Buffer",
                "description": "Stabilize bismuth vitriol salt, glacial alum shard, and chalk pearl lime past 48 C so cold-stiffened reagents settle cleanly.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [6.0, 8.0],
                "minPeakTempC": 48.0,
                "rewardCrowns": 102,
            },
            {
                "title": "Winter-Wharf Soothing Triplet",
                "description": "Warm amber honey resin beneath verdigris moss sap and rose madder distillate past 50 C without triggering thermal shear.",
                "requiredEffect": "soothing_draught",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.79,
                "targetPh": [5.2, 7.8],
                "minPeakTempC": 50.0,
                "rewardCrowns": 98,
            },
            {
                "title": "Aurora-Frost Tri-Layer Prism",
                "description": "Suspend cobalt lotus nectar, auric mica, and starlight aether oil in a teardrop decanter gently warmed past 45 C.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 3,
                "minLayerCrispness": 0.76,
                "minPurity": 0.80,
                "targetPh": [6.0, 8.8],
                "minPeakTempC": 45.0,
                "rewardCrowns": 108,
            },
            {
                "title": "Hearth-Ember Saffron Tonic",
                "description": "Drive peak temperature above 64 C across three distinct specific-gravity horizons while keeping pH gentle for courier flasks.",
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
                "description": "Suspend cobalt lotus nectar, moonveil dew, and auric mica in razor-crisp density tiers inside a faceted prism.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 3,
                "minLayerCrispness": 0.76,
                "minPurity": 0.80,
                "targetPh": [6.0, 8.8],
                "rewardCrowns": 112,
            },
            {
                "title": "Midnight Observatory Hearth Brew",
                "description": "Layer saffron hearth pollen, rose madder distillate, and starlight aether oil above 58 C for roof-watch astronomers.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 3,
                "minLayerCrispness": 0.75,
                "minPurity": 0.80,
                "targetPh": [5.6, 8.2],
                "minPeakTempC": 58.0,
                "rewardCrowns": 108,
            },
            {
                "title": "Meteor-Dust Cooling Unguent",
                "description": "Combine ground glacial alum shard, verdigris moss sap, and moonveil lichen dew into three calm, clear strata.",
                "requiredEffect": "burn_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.74,
                "minPurity": 0.79,
                "targetPh": [5.8, 8.6],
                "rewardCrowns": 102,
            },
            {
                "title": "Loupe-Grade Neutral Triplet",
                "description": "Calibrate bismuth vitriol salt, glacial alum shard, and chalk pearl lime to an exacting anthocyanin-violet neutral window.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 3,
                "minLayerCrispness": 0.76,
                "minPurity": 0.81,
                "targetPh": [6.3, 7.7],
                "rewardCrowns": 110,
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
            {
                "title": "Charter Sovereign Neutralizer",
                "description": "Stack four precision crystal-and-botanical strata in a carafe, holding anthocyanin pH cleanly inside a tight neutral corridor.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [6.4, 7.8],
                "rewardCrowns": 192,
            },
            {
                "title": "Canal Masterwork Fire-Ward",
                "description": "Balance cinnabar sulfur ash, bismuth vitriol, glacial alum, and saffron pollen past 64 C without breaching 98 C boil-over.",
                "requiredEffect": "fire_ward",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [4.5, 7.6],
                "minPeakTempC": 64.0,
                "rewardCrowns": 196,
            },
            {
                "title": "Four-Horizon Honeyed Quietude",
                "description": "Decant amber honey resin, verdigris moss sap, cobalt lotus nectar, and rose madder distillate into four unmarbled tiers.",
                "requiredEffect": "soothing_draught",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [5.2, 7.8],
                "rewardCrowns": 188,
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
            {
                "title": "Citadel Four-Layer Burn Reserve",
                "description": "Temper cinnabar sulfur ash with glacial alum shard, verdigris moss sap, and moonveil dew across four crisp density bands.",
                "requiredEffect": "burn_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [5.0, 8.0],
                "minPeakTempC": 54.0,
                "rewardCrowns": 198,
            },
            {
                "title": "Iron-Watch High-Heat Hearth Crown",
                "description": "Drive four stratified hearth layers above 72 C in a crescent decanter while guarding interfacial viscosity from thermal shear.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [5.4, 8.0],
                "minPeakTempC": 72.0,
                "rewardCrowns": 208,
            },
            {
                "title": "Siege-Prism Astral Deterrent",
                "description": "Suspend cobalt lotus, moonveil dew, auric mica, and starlight oil above 52 C in a commanding war-council prism.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [6.2, 8.8],
                "minPeakTempC": 52.0,
                "rewardCrowns": 210,
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
            {
                "title": "Four-Tier Orchard Honey Reserve",
                "description": "Stack amber honey resin, verdigris moss sap, cobalt lotus nectar, and rose madder distillate in pristine laminar poise.",
                "requiredEffect": "soothing_draught",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [5.2, 7.6],
                "rewardCrowns": 186,
            },
            {
                "title": "Silver-Rain Botanical Burn Crown",
                "description": "Harmonize glacial alum shard, verdigris moss sap, moonveil dew, and auric mica into a four-layer restorative carafe.",
                "requiredEffect": "burn_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.88,
                "targetPh": [5.5, 8.3],
                "rewardCrowns": 194,
            },
            {
                "title": "Equinox Four-Crown Galaxy Flask",
                "description": "Float four pristine pipette-prepared botanical and mica tiers in descending density order for harvest festival judges.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.86,
                "minPurity": 0.90,
                "targetPh": [6.6, 9.0],
                "rewardCrowns": 202,
            },
        ],
        "glacial_snap": [
            {
                "title": "Rime-Breaker Four-Layer Fire Ward",
                "description": "Tame exothermic cinnabar sulfur ash alongside glacial alum and saffron pollen past 68 C in four unbroken strata.",
                "requiredEffect": "fire_ward",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [4.4, 7.8],
                "minPeakTempC": 68.0,
                "rewardCrowns": 204,
            },
            {
                "title": "Solstice Hearth-Core Reserve",
                "description": "Marry four stratified layers past 70 C peak hearth temperature while preserving crisp viscosity horizons in a royal carafe.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [5.6, 8.2],
                "minPeakTempC": 70.0,
                "rewardCrowns": 200,
            },
            {
                "title": "Glacier-Alum Four-Tier Salve",
                "description": "Counter endothermic glacial alum cooling with gentle bellows heat past 48 C across four unclouded restorative layers.",
                "requiredEffect": "burn_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.88,
                "targetPh": [5.6, 8.4],
                "minPeakTempC": 48.0,
                "rewardCrowns": 196,
            },
            {
                "title": "Polar Aurora Quad-Strata Elixir",
                "description": "Warm four iridescent lotus-to-starlight horizons above 50 C inside a teardrop flask with near-zero shear folding.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.86,
                "minPurity": 0.89,
                "targetPh": [6.2, 8.8],
                "minPeakTempC": 50.0,
                "rewardCrowns": 212,
            },
        ],
        "starfall_conclave": [
            {
                "title": "Zenith Nebula Collector Crown",
                "description": "Achieve four luminous strata of lotus nectar, lichen dew, auric mica, and starlight oil at peak purity for Guild exhibition.",
                "requiredEffect": "galaxy_elixir",
                "minLayers": 4,
                "minLayerCrispness": 0.86,
                "minPurity": 0.90,
                "targetPh": [6.4, 9.0],
                "rewardCrowns": 215,
            },
            {
                "title": "Comet-Crucible Astral Fire Ward",
                "description": "Hold cinnabar sulfur ash, bismuth vitriol, chalk lime, and saffron pollen through 66 C peak heat with four sharp boundaries.",
                "requiredEffect": "fire_ward",
                "minLayers": 4,
                "minLayerCrispness": 0.84,
                "minPurity": 0.88,
                "targetPh": [4.5, 7.8],
                "minPeakTempC": 66.0,
                "rewardCrowns": 206,
            },
            {
                "title": "Orrery Sovereign pH Calibrator",
                "description": "Lock four dense mineral and botanical layers inside a razor-tight neutral pH corridor for glass-loupe scrutiny.",
                "requiredEffect": "neutralizing_salve",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [6.5, 7.5],
                "rewardCrowns": 204,
            },
            {
                "title": "Starlight-Tempered Hearth Quintessence",
                "description": "Fuse amber resin, saffron pollen, rose madder, and starlight oil above 68 C without dulling mica luminescence.",
                "requiredEffect": "hearth_tonic",
                "minLayers": 4,
                "minLayerCrispness": 0.85,
                "minPurity": 0.89,
                "targetPh": [5.5, 8.1],
                "minPeakTempC": 68.0,
                "rewardCrowns": 208,
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


_WEEK_REGIME_CACHE: dict[str, str] = {}


def seed_for_iso_week(iso_year_week: str) -> int:
    digest = hashlib.sha256(iso_year_week.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def parse_iso_year_week(iso_year_week: str) -> date | None:
    """Parse ``YYYY-Www`` into its ISO Monday date, or ``None`` if non-ISO."""
    parts = iso_year_week.split("-W")
    if len(parts) != 2:
        return None
    try:
        return date.fromisocalendar(int(parts[0]), int(parts[1]), 1)
    except ValueError:
        return None


def regime_for_iso_week(iso_year_week: str) -> str:
    """Deterministically pick the market regime for an ISO year-week string."""
    cached = _WEEK_REGIME_CACHE.get(iso_year_week)
    if cached is not None:
        return cached
    rng = random.Random(seed_for_iso_week(iso_year_week))
    regime = MARKET_REGIMES[rng.randrange(len(MARKET_REGIMES))]
    _WEEK_REGIME_CACHE[iso_year_week] = regime
    return regime


def compute_regime_occurrence(iso_year_week: str, target_regime: str) -> int | None:
    """Count zero-based prior occurrences of ``target_regime`` since ``ANCHOR_ISO_MONDAY``."""
    target_monday = parse_iso_year_week(iso_year_week)
    if target_monday is None or target_monday < ANCHOR_ISO_MONDAY:
        return None

    occurrences = 0
    cursor = ANCHOR_ISO_MONDAY
    while cursor <= target_monday:
        iso_cal = cursor.isocalendar()
        week_str = f"{iso_cal.year}-W{iso_cal.week:02d}"
        if regime_for_iso_week(week_str) == target_regime:
            if cursor == target_monday:
                return occurrences
            occurrences += 1
        cursor += timedelta(days=7)
    return None


def pick_non_repeating_index(salt: str, pool_len: int, occ_index: int) -> int:
    """Select an index in ``0..pool_len-1`` from shuffled non-repeating cycles."""
    if pool_len <= 1:
        return 0
    cycle = occ_index // pool_len
    pos = occ_index % pool_len
    prev_last: int | None = None
    for c in range(cycle + 1):
        order = list(range(pool_len))
        cycle_rng = random.Random(seed_for_iso_week(f"{salt}::cycle-{c}"))
        cycle_rng.shuffle(order)
        if prev_last is not None and order[0] == prev_last:
            swap_idx = 1 + cycle_rng.randrange(pool_len - 1)
            order[0], order[swap_idx] = order[swap_idx], order[0]
        if c == cycle:
            return order[pos]
        prev_last = order[-1]
    return 0


def build_festival_payload(iso_year_week: str) -> dict[str, Any]:
    rng = random.Random(seed_for_iso_week(iso_year_week))

    regime = MARKET_REGIMES[rng.randrange(len(MARKET_REGIMES))]
    occ_index = compute_regime_occurrence(iso_year_week, regime)
    festival_pool = REGIME_FESTIVALS[regime]
    if occ_index is not None:
        fest_idx = pick_non_repeating_index(f"{regime}::festival", len(festival_pool), occ_index)
    else:
        fest_idx = rng.randrange(len(festival_pool))
    festival_name, lore_note = festival_pool[fest_idx]

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
        if occ_index is not None:
            comm_idx = pick_non_repeating_index(f"{regime}::{tier}", len(pool), occ_index)
        else:
            comm_idx = rng.randrange(len(pool))
        chosen = dict(pool[comm_idx])
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
    if not isinstance(payload.get("festivalName"), str) or not payload["festivalName"].strip():
        raise ValueError("festivalName must be a non-empty string")
    if not isinstance(payload.get("loreNote"), str) or not payload["loreNote"].strip():
        raise ValueError("loreNote must be a non-empty string")

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
    if len({c.get("title") for c in commissions}) != 3 or len({c.get("id") for c in commissions}) != 3:
        raise ValueError("commissions must have 3 unique titles and IDs")
    for c in commissions:
        if c.get("requiredEffect") not in POTION_EFFECTS:
            raise ValueError(f"Invalid requiredEffect: {c.get('requiredEffect')}")
        if not isinstance(c.get("minLayers"), int) or c["minLayers"] < 1:
            raise ValueError(f"Invalid minLayers: {c.get('minLayers')}")
        if not (0 < float(c.get("minLayerCrispness", 0)) <= 1.0):
            raise ValueError(f"Invalid minLayerCrispness: {c.get('minLayerCrispness')}")
        if not (0 < float(c.get("minPurity", 0)) <= 1.0):
            raise ValueError(f"Invalid minPurity: {c.get('minPurity')}")
        if not isinstance(c.get("rewardCrowns"), int) or c["rewardCrowns"] <= 0:
            raise ValueError(f"Invalid rewardCrowns: {c.get('rewardCrowns')}")
        if "targetPh" in c:
            ph_pair = c["targetPh"]
            if not isinstance(ph_pair, list) or len(ph_pair) != 2 or not (1.5 <= ph_pair[0] < ph_pair[1] <= 12.5):
                raise ValueError(f"Invalid targetPh: {ph_pair}")
        if "minPeakTempC" in c and not (15.0 <= float(c["minPeakTempC"]) <= 98.0):
            raise ValueError(f"Invalid minPeakTempC: {c['minPeakTempC']}")


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
