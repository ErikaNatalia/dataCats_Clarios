# Ajuste final de los modelos BSTS y exportación de simulaciones para el pipeline.
#
# Por serie se ajusta un modelo consumo ~ producción + estado, con la especificación de menor MAPE
# en el backtest. Se exporta s[d,h] (pronóstico con producción 0) y beta[d], de modo que el consumo
# para cualquier plan x es  y[d,h] = s[d,h] + beta[d] * x[h]  (el front puede ingresar su plan; por
# defecto se usa el promedio de los últimos PLAN_MONTHS meses). La identidad se valida contra predict().
# Uso: Rscript modelos/bsts_forecast.R [csv_datos] [csv_backtest] [dir_salida]
args <- commandArgs(trailingOnly = TRUE)
source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "bsts_common.R"))
csv_in  <- if (length(args) >= 1) args[1] else "output/datos_limpios.csv"
csv_bt  <- if (length(args) >= 2) args[2] else "output/modelos/backtest_bsts.csv"
out_dir <- if (length(args) >= 3) args[3] else "output/modelos"

H <- 12
N_DRAWS <- 500   # simulaciones exportadas por serie
SERIES <- unique(read.csv(csv_in, stringsAsFactors = FALSE)$serie_id)  # una por hoja del Excel

backtest_summary <- function(csv) {
  if (!file.exists(csv)) return(NULL)
  bt <- read.csv(csv, stringsAsFactors = FALSE)
  bt <- bt[!is.na(bt$real), ]
  bt$ape <- abs(bt$pred - bt$real) / bt$real
  bt$cubre <- bt$real >= bt$lo95 & bt$real <= bt$hi95
  agg <- aggregate(cbind(ape, cubre) ~ serie + modelo, data = bt, FUN = mean, na.action = na.pass)
  by_h <- aggregate(ape ~ serie + modelo + h, data = bt, FUN = mean)
  list(agg = agg, by_h = by_h)
}

# Especificación con regresor de menor MAPE en el backtest (evaluada con la producción real).
choose_spec <- function(bt, serie) {
  if (is.null(bt)) return("ll_reg")
  a <- bt$agg[bt$agg$serie == serie & bt$agg$modelo %in% names(SPECS), ]
  a <- a[sapply(a$modelo, function(m) SPECS[[m]]$reg), ]
  if (!nrow(a)) return("ll_reg")
  a$modelo[which.min(a$ape)]
}

metrics_of <- function(bt, serie, modelo) {
  if (is.null(bt)) return(NULL)
  a <- bt$agg[bt$agg$serie == serie & bt$agg$modelo == modelo, ]
  if (!nrow(a)) return(NULL)
  h <- bt$by_h[bt$by_h$serie == serie & bt$by_h$modelo == modelo, ]
  list(mape = a$ape, cobertura95 = if (is.na(a$cubre)) NULL else a$cubre,
       mape_por_horizonte = setNames(as.list(h$ape[order(h$h)]), h$h[order(h$h)]))
}

thin <- function(m, n) m[unique(round(seq(1, nrow(m), length.out = n))), , drop = FALSE]

future_dates <- function(last, h) format(seq(last, by = "month", length.out = h + 1)[-1], "%Y-%m")

bt <- backtest_summary(csv_bt)
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

for (serie in SERIES) {
  d <- load_series(csv_in, serie)
  if (nrow(d) < MIN_MESES) {
    cat(sprintf("%s: %d meses (< %d), sin pronóstico\n", serie, nrow(d), MIN_MESES))
    unlink(file.path(out_dir, paste0(serie, "_bsts.json")))
    next
  }
  fechas <- future_dates(max(d$fecha), H)

  nm_b <- choose_spec(bt, serie)
  fit_b <- fit_bsts(d, SPECS[[nm_b]])
  burn <- burn_of(fit_b)
  beta <- fit_b$coefficients[-seq_len(burn), "x"]
  s <- forecast_draws(fit_b, SPECS[[nm_b]], H, x_futuro = rep(0, H), seed = 789)
  x_ref <- default_plan(d$x, H)
  y_ref <- forecast_draws(fit_b, SPECS[[nm_b]], H, x_futuro = x_ref, seed = 789)
  err_rel <- max(abs(y_ref - (s + beta %o% x_ref)) / abs(y_ref))
  if (err_rel > 1e-6) stop(sprintf("%s: s + beta*x no reproduce predict() (error relativo %.2e)", serie, err_rel))
  idx <- unique(round(seq(1, nrow(s), length.out = N_DRAWS)))

  # Consumo base histórico: contribución del estado (consumo con producción 0) por mes.
  base_hist <- colSums(aperm(fit_b$state.contributions[-seq_len(burn), , , drop = FALSE], c(2, 1, 3)))
  base_hist <- t(apply(base_hist, 2, quantile, c(0.025, 0.5, 0.975)))

  out <- list(
    serie = serie,
    generado = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    ultimo_mes = format(max(d$fecha), "%Y-%m"),
    fechas = fechas,
    escenarios = list(
      modelo = nm_b,
      backtest = list(produccion_real = metrics_of(bt, serie, nm_b),
                      plan_por_defecto = metrics_of(bt, serie, paste0(nm_b, "_plan")),
                      naive = metrics_of(bt, serie, "naive")),
      plan_meses = PLAN_MONTHS,
      x_referencia = x_ref,
      beta = beta[idx],
      s = s[idx, , drop = FALSE],
      validacion_error_relativo = err_rel
    ),
    consumo_base_historico = data.frame(fecha = format(d$fecha, "%Y-%m"),
                                        p2_5 = base_hist[, 1], p50 = base_hist[, 2], p97_5 = base_hist[, 3])
  )
  write_json(out, file.path(out_dir, paste0(serie, "_bsts.json")), digits = 6, auto_unbox = TRUE)
  cat(sprintf("%-11s modelo=%-10s beta=%.3f [%.3f, %.3f]  validación=%.1e\n", serie, nm_b,
              mean(beta), quantile(beta, 0.025), quantile(beta, 0.975), err_rel))
}
