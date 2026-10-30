# Gateway API в homelab-кластере

Миграция выполнена 31 октября 2026 года.

## Итоговая схема

```text
Клиент
  │
  ├─ DNS: contest.local.lan → 192.168.1.150
  │
  ▼
MetalLB VIP 192.168.1.150
  │
  ├─ :80  → HTTP 308 redirect на HTTPS
  └─ :443 → Envoy Gateway, TLS termination
                  │
                  ├─ contest.local.lan       → contest/frontend:80
                  ├─ kontent.local.lan       → kontent/web:80
                  ├─ kontent.local.lan/api   → kontent/api:3000
                  ├─ keycloak.local.lan      → kontent/keycloak:8080
                  ├─ minio.local.lan         → kontent/minio:9000
                  ├─ minio-console.local.lan → kontent/minio:9001
                  └─ grafana.local.lan       → monitoring/vm-stack-grafana:80
```

Публичный TLS завершается на Gateway. Внутри кластера Envoy обращается к Kubernetes Service по HTTP.

## Из каких ресурсов состоит Gateway API

### GatewayClass

`GatewayClass` выбирает реализацию Gateway API:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: local-gateway
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
```

В данном случае все Gateway с классом `local-gateway` обслуживает Envoy Gateway.

Это аналог связи `IngressClass → ingress-controller`, но Gateway API разделяет инфраструктуру и маршруты более явно.

### EnvoyProxy

`EnvoyProxy` — расширение Envoy Gateway, которое настраивает создаваемый data plane:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: local-gateway-proxy
  namespace: gateway-system
spec:
  provider:
    type: Kubernetes
    kubernetes:
      envoyDeployment:
        replicas: 2
```

Две реплики размещены на разных worker-узлах. Envoy Gateway автоматически создаёт и поддерживает их Deployment и Service типа `LoadBalancer`.

### Gateway

`Gateway` описывает точки входа — listeners:

```yaml
listeners:
  - name: http
    protocol: HTTP
    port: 80
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
        - name: local-apps-tls
```

Gateway ссылается на `EnvoyProxy` через `infrastructure.parametersRef`.

Поле `allowedRoutes.namespaces.from: All` разрешает приложениям из namespace `kontent`, `contest` и `monitoring` подключать свои маршруты к общему Gateway.

### HTTPRoute

`HTTPRoute` принадлежит приложению и связывает hostname/path с Service:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: contest
  namespace: contest
spec:
  parentRefs:
    - name: local-gateway
      namespace: gateway-system
      sectionName: https
  hostnames:
    - contest.local.lan
  rules:
    - backendRefs:
        - name: frontend
          port: 80
```

`parentRefs` подключает route к конкретному listener Gateway. `backendRefs` указывает Service в namespace самого route.

Для Kontent используются два path rule:

```text
/api → api:3000
/    → web:80
```

Более специфичный `/api` имеет приоритет над `/`.

### HTTP → HTTPS redirect

Перенаправление реализовано отдельным `HTTPRoute`, подключённым к listener `http`:

```yaml
filters:
  - type: RequestRedirect
    requestRedirect:
      scheme: https
      statusCode: 308
```

Код 308 сохраняет HTTP-метод и тело запроса.

### Certificate

cert-manager выпускает один wildcard-сертификат:

```yaml
dnsNames:
  - "*.local.lan"
```

Secret `local-apps-tls` находится в namespace `gateway-system`, рядом с Gateway. Сертификат подписан существующим `local-ca-issuer`, поэтому повторно устанавливать CA на клиентские устройства не требуется.

### MetalLB

MetalLB предоставляет Service типа `LoadBalancer` адрес из локальной сети:

```yaml
spec:
  addresses:
    - 192.168.1.150/32
```

В L2-режиме speaker объявляет VIP через ARP. Адрес не закреплён за `w1`: при отказе узла его может объявить другой узел.

## Где находятся манифесты

Общая инфраструктура:

```text
contest/k8s/platform-metallb.yml
contest/k8s/platform-gateway.yml
contest/k8s/dnsmasq-apps.conf
```

Маршруты приложений:

```text
contest/k8s/http-route.yml
kontent/k8s/12-gateway-routes.yaml
```

В будущем общие файлы лучше перенести в отдельный репозиторий состояния кластера.

## Как добавить новое приложение

1. Создать Deployment и Service приложения.
2. Создать `HTTPRoute` в namespace приложения.
3. Добавить hostname в HTTP redirect route.
4. Добавить DNS-запись на `192.168.1.150`.

Пример DNS:

```ini
address=/new-app.local.lan/192.168.1.150
```

Wildcard-сертификат уже покрывает имя `new-app.local.lan`.

## Диагностика

Состояние Gateway:

```bash
kubectl get gatewayclass,gateway -A
kubectl describe gateway local-gateway -n gateway-system
```

Состояние маршрутов:

```bash
kubectl get httproute -A
kubectl describe httproute contest -n contest
```

Для рабочего route ожидаются условия:

```text
Accepted=True
ResolvedRefs=True
```

Проверка Envoy и VIP:

```bash
kubectl get pods,svc -n envoy-gateway-system -o wide
curl -I https://contest.local.lan
curl -I http://contest.local.lan
```

HTTP-запрос должен получить redirect 308, HTTPS — ответ приложения.

Проверка DNS:

```bash
dig @192.168.1.140 contest.local.lan +short
```

Ожидаемый адрес:

```text
192.168.1.150
```

## Установленные версии

```text
MetalLB:       0.16.1
Envoy Gateway: 1.9.3
cert-manager:  1.21.3
```

ingress-nginx и старые Ingress-ресурсы удалены. Внешние приложения работают только через Gateway API на стандартных портах 80/443.
