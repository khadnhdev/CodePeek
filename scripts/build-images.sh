#!/bin/bash

# Build PHP image
docker build -t code-executor-php -f docker/php/Dockerfile .

# Build Python image
docker build -t code-executor-python -f docker/python/Dockerfile .

# Build Node.js image
docker build -t code-executor-nodejs -f docker/nodejs/Dockerfile . 