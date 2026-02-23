#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [,, collectionPath, outputDir, enableAllureArg] = process.argv;

if (!collectionPath || !outputDir) {
  console.error('Usage: node convert.js <collection_path> <output_directory> [enable_allure]');
  process.exit(1);
}

const enableAllure = enableAllureArg !== 'false';

// ─── Load Collection ──────────────────────────────────────────────────────────

let collection;
try {
  const raw = fs.readFileSync(collectionPath, 'utf8');
  collection = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to read collection file: ${err.message}`);
  process.exit(1);
}

// Support both Postman Collection v2.0 and v2.1
const info = collection.info || {};
const collectionName = sanitizeClassName(info.name || 'PostmanCollection');
const items = collection.item || [];

// ─── Flatten all requests ─────────────────────────────────────────────────────

function flattenItems(items, folderName) {
  const requests = [];
  for (const item of items) {
    if (item.item) {
      // It's a folder — recurse
      requests.push(...flattenItems(item.item, item.name));
    } else if (item.request) {
      requests.push({ ...item, folderName });
    }
  }
  return requests;
}

const requests = flattenItems(items, null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeClassName(name) {
  return name
    .replace(/[^a-zA-Z0-9_\s]/g, '')
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function sanitizeMethodName(name) {
  const base = name
    .replace(/[^a-zA-Z0-9_\s]/g, '')
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1)
                            : w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return 'test' + base.charAt(0).toUpperCase() + base.slice(1);
}

function resolveUrl(urlObj) {
  if (!urlObj) return { baseUri: 'http://localhost', path: '/' };
  if (typeof urlObj === 'string') {
    try {
      const u = new URL(urlObj.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
      return { baseUri: `${u.protocol}//${u.host}`, path: u.pathname + u.search };
    } catch {
      return { baseUri: 'http://localhost', path: urlObj };
    }
  }
  const protocol = (urlObj.protocol || 'https').replace(/:$/, '');
  const host = Array.isArray(urlObj.host) ? urlObj.host.join('.') : (urlObj.host || 'localhost');
  const pathParts = Array.isArray(urlObj.path) ? urlObj.path : [];
  const pathStr = '/' + pathParts.join('/');
  const port = urlObj.port ? `:${urlObj.port}` : '';
  const baseUri = `${protocol}://${host}${port}`;
  return { baseUri, path: pathStr };
}

function extractBearerToken(headers) {
  if (!headers) return null;
  for (const h of headers) {
    if (h.key && h.key.toLowerCase() === 'authorization') {
      const val = h.value || '';
      if (val.toLowerCase().startsWith('bearer ')) {
        return val.substring(7);
      }
    }
  }
  return null;
}

function extractAuth(request) {
  const auth = request.auth;
  if (auth) {
    if (auth.type === 'bearer') {
      const bearerArr = auth.bearer || [];
      const tokenEntry = bearerArr.find(e => e.key === 'token');
      return { type: 'bearer', token: tokenEntry ? tokenEntry.value : '{{bearerToken}}' };
    }
    if (auth.type === 'basic') {
      const basicArr = auth.basic || [];
      const user = (basicArr.find(e => e.key === 'username') || {}).value || '{{username}}';
      const pass = (basicArr.find(e => e.key === 'password') || {}).value || '{{password}}';
      return { type: 'basic', username: user, password: pass };
    }
  }
  // Fall back to Authorization header
  const headers = request.header || [];
  const token = extractBearerToken(headers);
  if (token) return { type: 'bearer', token };
  return null;
}

function getContentType(request) {
  const headers = request.header || [];
  for (const h of headers) {
    if (h.key && h.key.toLowerCase() === 'content-type') {
      return h.value;
    }
  }
  const body = request.body;
  if (body) {
    if (body.mode === 'raw') {
      const opts = body.options || {};
      const lang = (opts.raw || {}).language || 'json';
      if (lang === 'json') return 'application/json';
      if (lang === 'xml') return 'application/xml';
    }
    if (body.mode === 'formdata') return 'multipart/form-data';
    if (body.mode === 'urlencoded') return 'application/x-www-form-urlencoded';
  }
  return null;
}

function escapeJavaString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ─── Generate Java Test Method ────────────────────────────────────────────────

function generateTestMethod(item, enableAllure) {
  const req = item.request;
  const method = (req.method || 'GET').toLowerCase();
  const { baseUri, path: reqPath } = resolveUrl(req.url);
  const auth = extractAuth(req);
  const contentType = getContentType(req);
  const methodName = sanitizeMethodName(item.name || 'unnamedRequest');
  const description = escapeJavaString(item.name || 'Unnamed Request');
  const folder = item.folderName ? escapeJavaString(item.folderName) : null;

  const body = req.body;
  let bodyStr = null;
  if (body && body.mode === 'raw' && body.raw) {
    bodyStr = escapeJavaString(body.raw.trim());
  }

  const lines = [];

  if (enableAllure) {
    if (folder) lines.push(`    @Story("${folder}")`);
    lines.push(`    @Description("${description}")`);
  }
  lines.push(`    @Test`);
  lines.push(`    public void ${methodName}() {`);
  lines.push(`        given()`);
  lines.push(`            .baseUri("${escapeJavaString(baseUri)}")`);

  if (auth) {
    if (auth.type === 'bearer') {
      lines.push(`            .header("Authorization", "Bearer ${escapeJavaString(auth.token)}")`);
    } else if (auth.type === 'basic') {
      lines.push(`            .auth().basic("${escapeJavaString(auth.username)}", "${escapeJavaString(auth.password)}")`);
    }
  }

  if (contentType) {
    lines.push(`            .contentType("${escapeJavaString(contentType)}")`);
  }

  if (bodyStr) {
    lines.push(`            .body("${bodyStr}")`);
  }

  const safePath = escapeJavaString(reqPath);
  lines.push(`        .when()`);
  lines.push(`            .${method}("${safePath}")`);
  lines.push(`        .then()`);
  lines.push(`            .statusCode(200);`);
  lines.push(`    }`);

  return lines.join('\n');
}

// ─── Generate pom.xml ─────────────────────────────────────────────────────────

function generatePom(enableAllure) {
  const allureDeps = enableAllure ? `
        <!-- Allure RestAssured -->
        <dependency>
            <groupId>io.qameta.allure</groupId>
            <artifactId>allure-rest-assured</artifactId>
            <version>2.24.0</version>
        </dependency>

        <!-- Allure TestNG -->
        <dependency>
            <groupId>io.qameta.allure</groupId>
            <artifactId>allure-testng</artifactId>
            <version>2.24.0</version>
        </dependency>` : '';

  const allurePlugin = enableAllure ? `
            <!-- Allure Maven Plugin -->
            <plugin>
                <groupId>io.qameta.allure</groupId>
                <artifactId>allure-maven</artifactId>
                <version>2.12.0</version>
                <configuration>
                    <reportVersion>2.24.0</reportVersion>
                </configuration>
            </plugin>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.generated</groupId>
    <artifactId>restassured-tests</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <!-- RestAssured -->
        <dependency>
            <groupId>io.rest-assured</groupId>
            <artifactId>rest-assured</artifactId>
            <version>5.4.0</version>
            <scope>test</scope>
        </dependency>

        <!-- TestNG -->
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>7.8.0</version>
            <scope>test</scope>
        </dependency>

        <!-- Hamcrest -->
        <dependency>
            <groupId>org.hamcrest</groupId>
            <artifactId>hamcrest</artifactId>
            <version>2.2</version>
            <scope>test</scope>
        </dependency>${allureDeps}
    </dependencies>

    <build>
        <plugins>
            <!-- Maven Surefire Plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.1.2</version>
            </plugin>${allurePlugin}
        </plugins>
    </build>
</project>
`;
}

// ─── Generate Java Test Class ─────────────────────────────────────────────────

function generateTestClass(collectionName, requests, enableAllure) {
  const allureImports = enableAllure ? `
import io.qameta.allure.Description;
import io.qameta.allure.Story;
import io.qameta.allure.restassured.AllureRestAssured;` : '';

  const filterLine = enableAllure
    ? `        RestAssured.filters(new AllureRestAssured());`
    : '';

  const setupMethod = filterLine ? `
    @BeforeClass
    public void setUp() {
${filterLine}
    }
` : '';

  const methods = requests.map(item => generateTestMethod(item, enableAllure)).join('\n\n');

  return `package tests;

import io.restassured.RestAssured;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;${allureImports}

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

public class ${collectionName}Test {
${setupMethod}
${methods}
}
`;
}

// ─── Write Output Files ───────────────────────────────────────────────────────

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const testSrcDir = path.join(outputDir, 'src', 'test', 'java', 'tests');
mkdirp(testSrcDir);

// Write pom.xml
const pomContent = generatePom(enableAllure);
fs.writeFileSync(path.join(outputDir, 'pom.xml'), pomContent, 'utf8');
console.log(`Generated: ${path.join(outputDir, 'pom.xml')}`);

// Write Java test class
const testClassContent = generateTestClass(collectionName, requests, enableAllure);
const testFileName = `${collectionName}Test.java`;
fs.writeFileSync(path.join(testSrcDir, testFileName), testClassContent, 'utf8');
console.log(`Generated: ${path.join(testSrcDir, testFileName)}`);

console.log(`\nSuccessfully converted ${requests.length} request(s) from "${info.name || 'collection'}" to RestAssured tests.`);
