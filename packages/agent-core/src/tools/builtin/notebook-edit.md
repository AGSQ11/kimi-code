Use NotebookEdit to inspect or modify `.ipynb` Jupyter notebooks without corrupting their JSON structure.

- `read` — list cells with their index, type, and source.
- `edit` — replace the source of a single cell by index.
- `write` — create or overwrite a notebook with the provided cells.

For `edit`, first call `read` to find the target cell index. For `write`, provide cells as an array of `{ "cell_type": "code" | "markdown", "source": "..." }`.

This tool preserves notebook metadata and outputs on read/write; `edit` only changes the requested cell's source.