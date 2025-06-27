# Use an official Ubuntu as a parent image
FROM ubuntu:latest

# Set the working directory to /home/ubuntu
WORKDIR /home/ubuntu

# Create a non-root user
RUN useradd -ms /bin/bash ubuntu

# Set the user to ubuntu
USER ubuntu

# Install any necessary packages
RUN apt-get update && apt-get install -y \
    curl \
    git \
    # Add other necessary packages here

# Define environment variables
ENV AGENT_ENV production

# Expose any necessary ports (if applicable)
# EXPOSE 8080

# Command to run the background agent
CMD ["echo", "Background agent environment is set up!"]
