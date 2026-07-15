const DEFAULT_VALUES = {
  balance: 300000,
  rate: 10,
  years: 25,
  months: 0,
  system: "sac",
  monthlyExtra: 500,
  annualExtra: 0,
  oneTimeExtra: 0,
  oneTimeMonth: 12
};

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1
});
let chart;

function parseMoney(value) {
  const clean = String(value)
    .replace(/\s/g, "").replace(/R\$/g, "").replace(/\./g, "")
    .replace(",", ".").replace(/[^0-9.-]/g, "");
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function formatMoneyInput(input) {
  input.value = parseMoney(input.value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function monthlyRate(annualRate) {
  return Math.pow(1 + annualRate / 100, 1 / 12) - 1;
}

function simulate(values, includeExtras) {
  let balance = values.balance;
  let month = 0;
  let totalInterest = 0;
  const rate = monthlyRate(values.rate);
  const sacAmortization = values.balance / values.totalMonths;
  const pricePayment = rate === 0
    ? values.balance / values.totalMonths
    : values.balance * rate / (1 - Math.pow(1 + rate, -values.totalMonths));

  const rows = [{ month: 0, balance }];

  while (balance > 0.005 && month < values.totalMonths + 600) {
    month += 1;
    const interest = balance * rate;

    let scheduledAmortization = values.system === "sac"
      ? sacAmortization
      : Math.max(pricePayment - interest, 0);

    scheduledAmortization = Math.min(scheduledAmortization, balance);

    let extraPayment = 0;
    if (includeExtras) {
      extraPayment += values.monthlyExtra;

      // Pagamento anual, exatamente a cada 12 meses.
      if (values.annualExtra > 0 && month % 12 === 0) {
        extraPayment += values.annualExtra;
      }

      if (values.oneTimeExtra > 0 && month === values.oneTimeMonth) {
        extraPayment += values.oneTimeExtra;
      }
    }

    const totalAmortization = Math.min(
      scheduledAmortization + extraPayment,
      balance
    );

    totalInterest += interest;
    balance = Math.max(0, balance - totalAmortization);
    rows.push({ month, balance });

    if (totalAmortization <= 0) break;
  }

  return { months: month, totalInterest, rows };
}

function durationText(months) {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [];

  if (years) parts.push(`${years} ano${years === 1 ? "" : "s"}`);
  if (remainingMonths) {
    parts.push(`${remainingMonths} ${remainingMonths === 1 ? "mês" : "meses"}`);
  }

  return parts.join(" e ") || "0 meses";
}

function getValues() {
  return {
    balance: parseMoney($("balance").value),
    rate: Number($("rate").value),
    totalMonths: Number($("years").value) * 12 + Number($("months").value),
    system: $("system").value,
    monthlyExtra: parseMoney($("monthly-extra").value),
    annualExtra: parseMoney($("annual-extra").value),
    oneTimeExtra: parseMoney($("one-time-extra").value),
    oneTimeMonth: Number($("one-time-month").value)
  };
}

function validate(values) {
  if (values.balance <= 0) return "Informe um saldo devedor maior que zero.";
  if (values.rate < 0 || values.rate > 100) return "Informe uma taxa entre 0% e 100% ao ano.";
  if (!Number.isInteger(values.totalMonths) || values.totalMonths < 1) {
    return "Informe um prazo restante válido.";
  }
  if (
    values.monthlyExtra < 0 ||
    values.annualExtra < 0 ||
    values.oneTimeExtra < 0
  ) {
    return "Pagamentos extras não podem ser negativos.";
  }
  if (values.oneTimeExtra > 0 && values.oneTimeMonth < 1) {
    return "Informe quando o pagamento único será realizado.";
  }
  return "";
}

function chartBalanceAt(rows, month) {
  if (month >= rows.length) return 0;
  return rows[month]?.balance ?? 0;
}

function updateChart(original, accelerated) {
  const maxMonths = Math.max(original.months, accelerated.months);
  const labels = [];
  const originalData = [];
  const acceleratedData = [];

  for (let month = 0; month <= maxMonths; month += 12) {
    labels.push(`${month / 12} ano${month === 12 ? "" : "s"}`);
    originalData.push(chartBalanceAt(original.rows, month));
    acceleratedData.push(chartBalanceAt(accelerated.rows, month));
  }

  if (maxMonths % 12 !== 0) {
    labels.push(durationText(maxMonths));
    originalData.push(chartBalanceAt(original.rows, maxMonths));
    acceleratedData.push(chartBalanceAt(accelerated.rows, maxMonths));
  }

  const data = {
    labels,
    datasets: [
      {
        label: "Plano original",
        data: originalData,
        borderColor: "#5c4300",
        backgroundColor: "rgba(92,67,0,.08)",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.18
      },
      {
        label: "Com pagamentos extras",
        data: acceleratedData,
        borderColor: "#edc23a",
        backgroundColor: "rgba(237,194,58,.12)",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.18
      }
    ]
  };

  if (chart) {
    chart.data = data;
    chart.update();
    return;
  }

  chart = new Chart($("balance-chart"), {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${brl.format(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#756343", maxTicksLimit: 8 } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(92,67,0,.10)" },
          ticks: { color: "#756343", callback: value => compactBrl.format(value) }
        }
      }
    }
  });
}

function calculate() {
  const values = getValues();
  const error = validate(values);
  $("error").textContent = error;
  if (error) return;

  const original = simulate(values, false);
  const accelerated = simulate(values, true);
  const savedMonths = Math.max(0, original.months - accelerated.months);
  const savedInterest = Math.max(
    0,
    original.totalInterest - accelerated.totalInterest
  );

  $("interest-saved").textContent = brl.format(savedInterest);
  $("time-saved").textContent = durationText(savedMonths);
  $("original-term").textContent = durationText(original.months);
  $("new-term").textContent = durationText(accelerated.months);
  $("base-interest").textContent = brl.format(original.totalInterest);
  $("extra-interest").textContent = brl.format(accelerated.totalInterest);

  updateChart(original, accelerated);

  if (typeof gtag === "function") {
    gtag("event", "calcular_quitacao_financiamento", {
      sistema: values.system,
      prazo_meses: values.totalMonths,
      possui_extra_mensal: values.monthlyExtra > 0,
      possui_extra_anual: values.annualExtra > 0,
      possui_pagamento_unico: values.oneTimeExtra > 0
    });
  }
}

function restoreDefaults() {
  $("balance").value = DEFAULT_VALUES.balance.toLocaleString("pt-BR", {
    minimumFractionDigits: 2
  });
  $("rate").value = DEFAULT_VALUES.rate;
  $("years").value = DEFAULT_VALUES.years;
  $("months").value = DEFAULT_VALUES.months;
  $("system").value = DEFAULT_VALUES.system;
  $("monthly-extra").value = DEFAULT_VALUES.monthlyExtra.toLocaleString("pt-BR", {
    minimumFractionDigits: 2
  });
  $("annual-extra").value = DEFAULT_VALUES.annualExtra.toLocaleString("pt-BR", {
    minimumFractionDigits: 2
  });
  $("one-time-extra").value = DEFAULT_VALUES.oneTimeExtra.toLocaleString("pt-BR", {
    minimumFractionDigits: 2
  });
  $("one-time-month").value = DEFAULT_VALUES.oneTimeMonth;
  $("error").textContent = "";
  calculate();
}

$("payoff-form").addEventListener("submit", (event) => {
  event.preventDefault();
  ["balance", "monthly-extra", "annual-extra", "one-time-extra"].forEach(id => {
    formatMoneyInput($(id));
  });
  calculate();
});

$("reset").addEventListener("click", restoreDefaults);

["balance", "monthly-extra", "annual-extra", "one-time-extra"].forEach(id => {
  $(id).addEventListener("blur", () => formatMoneyInput($(id)));
});

window.addEventListener("DOMContentLoaded", restoreDefaults);
