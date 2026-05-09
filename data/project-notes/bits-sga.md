#this is an SGA (staff gradded assessment) from BITS which i needed to complete because it had weighted which affects my CGPA in bits.

# Library CRUD Spring Boot Application

This project is a Spring Boot MVC application that manages two related entities: `Author` and `Book`.


## Features

- JPA entity relationship: one author can have many books.
- H2 in-memory database with 10 seeded rows in each table.
- Create, read and update operations for both entities.
- JSP views with JSTL/EL.
- Custom repository inner join query for listing books with author details.
- Repository and service tests using JUnit, Spring Data JPA test support and Mockito.

## Run

```bash
mvn spring-boot:run
```

Open `http://localhost:8080`.

## Test

```bash
mvn test
```

## Database

H2 console is enabled at `http://localhost:8080/h2-console`.

- JDBC URL: `jdbc:h2:mem:librarydb`
- Username: `sa`
- Password: blank