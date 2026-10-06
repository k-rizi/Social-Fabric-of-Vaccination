# The Social Fabric of Vaccination

This repository contains the code, plotting data, and figure files for **Figures 3 and 4** of the manuscript:

**The Social Fabric of Vaccination**

## Figures

### Figure 3 — Local vaccination environments across social layers

Figure 3 examines how vaccinated and unvaccinated individuals are embedded in different local vaccination environments across four social layers:

- Work
- Education
- Household
- Family

The figure includes the multilayer-network schematic and the distributions of local vaccination coverage within and across these social settings.

Main files:

- `fig3.ipynb` — code used to generate Figure 3
- `fig3_plotdata.parquet` — plotting data
- `plotdata_summary_kinship_types.parquet` — kinship-summary data used in the family-layer analysis
- `multilayer-network.js` — multilayer-network schematic
- `figure3.pdf` — final figure
- `figure3.png` — PNG version
- `figure3_BG.pdf` — background/base figure asset

### Figure 4 — Vaccination composition within social cliques

Figure 4 examines vaccination composition within work, education, and household cliques, and compares the empirical distributions with randomized null models.

Main files:

- `fig4.ipynb` — code used to generate Figure 4
- `figure4_plotdata.parquet` — plotting data
- `figure4.pdf` — final figure

## Reproducing the figures

Open the corresponding Jupyter notebook:

```bash
jupyter notebook fig3.ipynb
