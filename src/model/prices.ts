/**
 * Malaysian market prices used as defaults (checked 13 November 2026). Each is a setting a company
 * replaces with its own tariff, invoice or contract price. Sources are listed on the Data & sources page.
 */

/** TNB non-domestic medium-voltage tariff from 1 July 2025: 29.83 sen/kWh energy + RM 89.27/kW of
 *  maximum demand (capacity + network). At an 80% load factor that is about RM 0.45/kWh all-in.
 *  High-voltage users (e.g. a steel mill) pay about RM 0.48/kWh all-in. */
export const ELECTRICITY_RM_PER_MWH = 450

/** No current industrial gas selling price is published (it depends on the customer's contract);
 *  RM 40/GJ is an assumption for the sample plants. */
export const GAS_RM_PER_GJ = 40

/** LME zinc cash about US$3,760/t (12 Nov 2026) × RM 4.08 per US$. */
export const ZINC_RM_PER_T = 15_300

/** EU carbon permit (EUA) about €90/t (13 Nov 2026). */
export const EU_CARBON_PRICE_EUR = 90

/** ECB reference rate, 11 Nov 2026: €1 = RM 4.5326. */
export const RM_PER_EUR = 4.53

/** Malaysia's carbon tax has no confirmed rate (RM 15–45/t discussed); RM 35/t is illustrative. */
export const MALAYSIA_CARBON_PRICE_RM = 35

/** TNB Green Electricity Tariff premium from 1 July 2025: 5, 4 or 3 sen/kWh for a 1-, 2- or 3-year
 *  subscription, the same for all customer categories. We use the 3-year rate, 3 sen/kWh. */
export const GET_PREMIUM_RM_PER_MWH = 30
