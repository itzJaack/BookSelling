/* Opzioni condivise tra catalogo e pannello admin. */
window.Condizioni = (() => {
  const values = Object.freeze(["Nuovo", "Come Nuovo", "Ottimo", "Buono", "Discreto", "Segnato", "Sottolineato", "Evidenziato", "Con appunti", "Copertina usurata"]);
  function populate(select, all = false) {
    select.replaceChildren();
    if (all) select.add(new Option("Tutte le condizioni", ""));
    for (const value of values) select.add(new Option(value, value, !all && value === "Come Nuovo", !all && value === "Come Nuovo"));
  }
  function badge(value) {
    if (["Nuovo", "Come Nuovo", "Ottimo"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (value === "Buono") return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return Object.freeze({ values, populate, badge });
})();
