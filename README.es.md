# ChemEFlow

**Modelado visual y transparente de balances de materia para la educación en ingeniería química.**

ChemEFlow conecta el diagrama de proceso, las variables, las ecuaciones, las dependencias y el código numérico en un solo flujo de trabajo. El usuario puede definir componentes, construir un flowsheet, configurar corrientes, diagnosticar si el modelo puede resolverse, ejecutar una resolución global y exportar la formulación a Python o MATLAB.

## Problema que aborda

En la enseñanza de balances de materia, los cálculos manuales, la programación y los simuladores suelen presentarse como herramientas separadas. Este salto entre representaciones puede dificultar que el estudiante comprenda qué variables conoce, cuáles faltan, qué ecuaciones producen cada resultado y por qué un modelo es resoluble o no.

ChemEFlow propone un enfoque **glass-box**: no oculta la estructura matemática, sino que permite inspeccionarla y modificarla.

## Funciones principales

- Definición de componentes y pesos moleculares.
- Selección de base másica o molar.
- Construcción visual de flowsheets con fuentes, sumideros y operaciones unitarias.
- Configuración de flujo y composición de cada corriente.
- Puertos independientes y móviles para cada stream conectado.
- Declaración de variables de usuario.
- Sistemas lineales de tamaño arbitrario.
- Funciones objetivo construidas con bloques de expresión.
- Seguimiento de dependencias y detección de ciclos.
- Separación entre diagnóstico (`Analyze`) y resolución (`Solve`).
- Propagación de relaciones de corrientes y validación física.
- Tablas de resultados másicos y molares.
- Exportación a CSV, Python y MATLAB.
- Guardado y apertura de proyectos editables.

## Instalación rápida

### Backend opcional

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

### Frontend

```bash
npm install
npm run dev
```

Abre normalmente `http://localhost:5173`.

Consulta el [`README.md`](README.md) principal para instrucciones completas, alcance, estructura y pruebas.

### Orden transparente de dependencias
ChemEFlow muestra cómo dependen entre sí los bloques de ecuaciones. Las funciones objetivo conservan qué entradas fueron resueltas durante el Solve global, mientras que el inventario de variables muestra el orden de resolución utilizado por el solucionador basado en dependencias.
