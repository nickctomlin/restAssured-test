# Postman to RestAssured Converter Action

A GitHub Action that converts Postman collections (`.json`) into Java RestAssured test cases with optional Allure reporting support.

## 📌 Overview

This GitHub Action automates the conversion of Postman collections into Java RestAssured test cases. It supports:

- REST API testing with generated Java code
- Allure Reporting (optional)
- Seamless integration with CI/CD pipelines

## 🚀 Features

- ✅ Convert Postman collections to RestAssured test cases
- ✅ Supports OAuth2 Bearer Token Authentication
- ✅ Supports HTTP Basic Authentication
- ✅ Automatic test generation with assertions
- ✅ Optional Allure reporting for test execution

## 📂 Project Structure

```
.
├── Dockerfile
├── action.yml
├── entrypoint.sh
├── scripts/
│   └── convert.js
└── package.json
```

## 🔧 Inputs

| Input Name         | Required | Default             | Description                                |
|--------------------|----------|---------------------|--------------------------------------------|
| `collection_path`  | ✅       | N/A                 | Path to the Postman collection (`.json`).  |
| `output_directory` | ❌       | `./generated-tests` | Directory to store generated tests.        |
| `enable_allure`    | ❌       | `true`              | Enable Allure report generation.           |

## 📊 Outputs

| Output Name | Description                           |
|-------------|---------------------------------------|
| `test_path` | Path to the generated test files.     |

## ▶️ Usage

Add the following step to your GitHub Actions workflow:

```yaml
name: Convert Postman to RestAssured

on:
  push:
    branches:
      - main

jobs:
  convert:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Run Postman to RestAssured Converter
        uses: nickctomlin/restAssured-test@v1.0.0
        with:
          collection_path: 'path/to/your-collection.json'
          output_directory: './generated-tests'
          enable_allure: 'true'

      - name: Upload RestAssured Tests
        uses: actions/upload-artifact@v3
        with:
          name: restassured-tests
          path: ./generated-tests
```

## 📊 Allure Reporting

If Allure is enabled, the action will:

1. Add Allure RestAssured and Allure TestNG dependencies to the generated `pom.xml`.
2. Add `@Description` and `@Story` annotations to each test method.
3. Attach an `AllureRestAssured` filter to log request/response details.

You can then run the generated project and upload the report:

```yaml
      - name: Run Generated Tests
        run: mvn clean test -f ./generated-tests/pom.xml

      - name: Generate Allure Report
        run: mvn allure:report -f ./generated-tests/pom.xml

      - name: Upload Allure Report
        uses: actions/upload-artifact@v3
        with:
          name: allure-report
          path: ./generated-tests/allure-report
```

## 🛠️ Development

Clone the repository:

```bash
git clone https://github.com/nickctomlin/restAssured-test.git
cd restAssured-test
```

Run the converter locally:

```bash
node scripts/convert.js path/to/your-collection.json ./output true
```

Build and test with Docker:

```bash
docker build -t postman-to-restassured .
docker run --rm \
  -e INPUT_COLLECTION_PATH="path/to/your-collection.json" \
  -e INPUT_OUTPUT_DIRECTORY="./generated-tests" \
  -e INPUT_ENABLE_ALLURE="true" \
  -v "$(pwd):/workspace" \
  postman-to-restassured
```

## 📄 License

This project is licensed under the MIT License.
