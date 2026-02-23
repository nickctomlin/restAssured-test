#!/bin/bash
set -e

COLLECTION_PATH="${INPUT_COLLECTION_PATH}"
OUTPUT_DIRECTORY="${INPUT_OUTPUT_DIRECTORY:-./generated-tests}"
ENABLE_ALLURE="${INPUT_ENABLE_ALLURE:-true}"

if [ -z "$COLLECTION_PATH" ]; then
  echo "Error: collection_path input is required."
  exit 1
fi

if [ ! -f "$COLLECTION_PATH" ]; then
  echo "Error: Collection file not found at path: $COLLECTION_PATH"
  exit 1
fi

echo "Converting Postman collection: $COLLECTION_PATH"
echo "Output directory: $OUTPUT_DIRECTORY"
echo "Allure reporting enabled: $ENABLE_ALLURE"

node /scripts/convert.js "$COLLECTION_PATH" "$OUTPUT_DIRECTORY" "$ENABLE_ALLURE"

echo "Conversion complete."
echo "test_path=$OUTPUT_DIRECTORY" >> "$GITHUB_OUTPUT"
