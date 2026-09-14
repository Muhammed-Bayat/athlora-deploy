const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

export const anatomyModelUrl = `${base}models/athlora-anatomy.glb`;
export const anatomyMapUrl = `${base}models/athlora-anatomy-map-v2.json`;
