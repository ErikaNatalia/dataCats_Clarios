# Backtesting de origen móvil para elegir la especificación BSTS de cada serie.
#
# Para cada origen t (últimos ORIGINS_SPAN meses, cada ORIGIN_STEP meses) se entrena con los
# datos hasta t y se pronostican H meses. Los modelos con regresor se evalúan dos veces:
#   <spec>       con la producción real del periodo de prueba (precisión si el plan se cumple);
#   <spec>_plan  con el plan por defecto (promedio de los últimos PLAN_MONTHS meses del
#                entrenamiento), que es lo que ve el front si no ingresa otro plan.
# Uso: Rscript modelos/bsts_backtest.R [csv_entrada] [csv_salida]
args <- commandArgs(trailingOnly = TRUE)
source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "bsts_common.R"))
csv_in  <- if (length(args) >= 1) args[1] else "output/datos_limpios.csv"
csv_out <- if (length(args) >= 2) args[2] else "output/modelos/backtest_bsts.csv"

H <- 6
ORIGINS_SPAN <- 30
ORIGIN_STEP <- 2
NITER_BT <- 2000
SERIES <- unique(read.csv(csv_in, stringsAsFactors = FALSE)$serie_id)  # una por hoja del Excel

benchmarks <- function(train, h) {
  y <- train$y
  last <- tail(na.omit(y), 1)
  n <- length(y)
  snaive <- sapply(seq_len(h), function(k) { v <- y[n + k - 12 * ceiling(k / 12)]; if (is.na(v)) last else v })
  list(naive = rep(last, h), snaive = snaive)
}

run_origin <- function(serie, d, k) {
  train <- d[seq_len(k), ]
  test <- d[(k + 1):min(k + H, nrow(d)), ]
  h <- nrow(test)
  rows <- list()
  add <- function(modelo, pred, lo = NA, hi = NA) {
    rows[[length(rows) + 1]] <<- data.frame(
      serie = serie, origen = as.character(train$fecha[k]), modelo = modelo,
      h = seq_len(h), fecha = as.character(test$fecha), real = test$y,
      pred = pred, lo95 = lo, hi95 = hi)
  }
  b <- benchmarks(train, h)
  add("naive", b$naive)
  add("snaive", b$snaive)
  for (nm in names(SPECS)) {
    spec <- SPECS[[nm]]
    fit <- tryCatch(fit_bsts(train, spec, niter = NITER_BT), error = function(e) NULL)
    if (is.null(fit)) next
    dr <- forecast_draws(fit, spec, h, x_futuro = test$x)
    add(nm, colMeans(dr), apply(dr, 2, quantile, 0.025), apply(dr, 2, quantile, 0.975))
    if (spec$reg) {
      dr <- forecast_draws(fit, spec, h, x_futuro = default_plan(train$x, h))
      add(paste0(nm, "_plan"), colMeans(dr), apply(dr, 2, quantile, 0.025), apply(dr, 2, quantile, 0.975))
    }
  }
  do.call(rbind, rows)
}

jobs <- list()
for (s in SERIES) {
  d <- load_series(csv_in, s)
  inicio <- max(MIN_MESES, nrow(d) - ORIGINS_SPAN)
  if (inicio > nrow(d) - 1) { cat(sprintf("%s: %d meses, sin backtest\n", s, nrow(d))); next }
  origins <- seq(inicio, nrow(d) - 1, by = ORIGIN_STEP)
  for (k in origins) jobs[[length(jobs) + 1]] <- list(s = s, d = d, k = k)
}
res <- parallel::mclapply(jobs, function(j) run_origin(j$s, j$d, j$k),
                          mc.cores = max(1, parallel::detectCores() - 2))
res <- do.call(rbind, res)
dir.create(dirname(csv_out), showWarnings = FALSE, recursive = TRUE)
write.csv(res, csv_out, row.names = FALSE)

# Resumen: MAPE por serie y modelo (todos los horizontes) y cobertura del intervalo 95 %.
ok <- !is.na(res$real)
res$ape <- abs(res$pred - res$real) / res$real
res$cubre <- res$real >= res$lo95 & res$real <= res$hi95
agg <- aggregate(cbind(ape, cubre) ~ serie + modelo, data = res[ok, ], FUN = mean, na.action = na.pass)
agg$ape <- round(100 * agg$ape, 1)
agg$cubre <- round(100 * agg$cubre)
names(agg) <- c("serie", "modelo", "MAPE_pct", "cobertura95_pct")
for (s in SERIES) {
  a <- agg[agg$serie == s, ]
  print(a[order(a$MAPE_pct), ], row.names = FALSE)
  cat("\n")
}
