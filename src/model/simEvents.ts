/** Lets the guided tour drive the simulations: open a zoomed-in view, select a unit, show the heat map. */
export const SIM_EVENT = 'chitocapture:sim'
export type SimCommand = { dive?: 'kettle' | null; select?: string | null; heatmap?: boolean }
export const sendSim = (command: SimCommand) => window.dispatchEvent(new CustomEvent<SimCommand>(SIM_EVENT, { detail: command }))
