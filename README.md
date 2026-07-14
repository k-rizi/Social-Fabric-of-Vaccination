# Social Fabric of Vaccination

This repository contains the code and processed data used to reproduce Figures 3 and 4 of the paper **“Social Fabric of Vaccination.”**

The Jupyter notebooks generate the figures from the corresponding processed `.parquet` data files.

## Contents

* `fig4.ipynb` — notebook used to generate Figure 3
* `fig5.ipynb` — notebook used to generate Figure 4
* `fig4_plotdata.parquet` — processed data used by `fig4.ipynb`
* `figure5_plotdata.parquet` — processed data used by `fig5.ipynb`
* `plotdata_summary_kinship_types.parquet` — additional processed data used in the analysis
* `.pdf`, `.png`, and `.svg` files — exported versions of the figures

## Usage

Open and run the notebooks in Jupyter:

```bash
jupyter notebook fig4.ipynb
jupyter notebook fig5.ipynb
```

The notebooks use the processed data included in this repository and reproduce the corresponding figures.
