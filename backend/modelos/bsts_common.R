# Funciones compartidas para los modelos BSTS de consumo (energía y gas).
suppressPackageStartupMessages({
  library(bsts)
  library(jsonlite)
})

# Meses atípicos (COVID) que se tratan como faltantes en la respuesta; mismo criterio que pipeline/config.py.
EXCLUDED <- list(c("2020-04-01", "2020-06-01"))
NITER <- 4000
# Plan de producción por defecto: promedio de los últimos PLAN_MONTHS meses con dato
# (mismo valor que PLAN_MONTHS en pipeline/config.py).
PLAN_MONTHS <- 3
default_plan <- function(x, h) rep(mean(tail(x[!is.na(x)], PLAN_MONTHS)), h)
BURN_FRAC <- 0.2

# Especificaciones candidatas. `reg = TRUE` agrega la producción como regresor (modelo de escenarios).
SPECS <- list(
  ll        = list(trend = "level",     seasonal = FALSE, reg = FALSE),
  llt       = list(trend = "linear",    seasonal = FALSE, reg = FALSE),
  ll_s12    = list(trend = "level",     seasonal = TRUE,  reg = FALSE),
  llt_s12   = list(trend = "linear",    seasonal = TRUE,  reg = FALSE),
  sll_s12   = list(trend = "semilocal", seasonal = TRUE,  reg = FALSE),
  ll_reg    = list(trend = "level",     seasonal = FALSE, reg = TRUE),
  ll_s12_reg = list(trend = "level",    seasonal = TRUE,  reg = TRUE),
  llt_reg   = list(trend = "linear",    seasonal = FALSE, reg = TRUE)
)

# Meses mínimos de historia para ajustar un modelo (series más cortas quedan sin pronóstico).
MIN_MESES <- 24

# Serie mensual del total de planta: fecha, y (consumo; NA en meses excluidos), x (producción).
load_series <- function(csv, serie) {
  d <- read.csv(csv, stringsAsFactors = FALSE)
  d <- d[d$serie_id == serie & d$es_total %in% c("True", "TRUE", TRUE), ]
  d$fecha <- as.Date(d$fecha)
  d <- d[order(d$fecha), c("fecha", "consumo", "produccion")]
  names(d) <- c("fecha", "y", "x")
  for (p in EXCLUDED) d$y[d$fecha >= as.Date(p[1]) & d$fecha <= as.Date(p[2])] <- NA
  d
}

state_spec <- function(y, spec) {
  ss <- list()
  ss <- switch(spec$trend,
    level     = AddLocalLevel(ss, y),
    linear    = AddLocalLinearTrend(ss, y),
    semilocal = AddSemilocalLinearTrend(ss, y))
  if (spec$seasonal) ss <- AddSeasonal(ss, y, nseasons = 12)
  ss
}

fit_bsts <- function(d, spec, niter = NITER, seed = 123) {
  set.seed(seed)
  ss <- state_spec(d$y, spec)
  if (spec$reg) {
    # Con un solo regresor se fuerza su inclusión (probabilidad 1) para que β sea interpretable.
    bsts(y ~ x, state.specification = ss, data = d, niter = niter, ping = 0,
         expected.model.size = 2, seed = seed)
  } else {
    bsts(d$y, state.specification = ss, niter = niter, ping = 0, seed = seed)
  }
}

burn_of <- function(fit) max(1, floor(BURN_FRAC * fit$niter))

# Matriz draws x horizonte. `x_futuro` solo se usa en modelos con regresor.
forecast_draws <- function(fit, spec, h, x_futuro = NULL, seed = 456) {
  set.seed(seed)
  if (spec$reg) {
    p <- predict(fit, newdata = data.frame(x = x_futuro), burn = burn_of(fit), seed = seed)
  } else {
    p <- predict(fit, horizon = h, burn = burn_of(fit), seed = seed)
  }
  p$distribution
}
