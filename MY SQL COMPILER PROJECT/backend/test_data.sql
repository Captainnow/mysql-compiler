CREATE TABLE employee_demographics (
  id int(11) AUTO_INCREMENT PRIMARY KEY,
  name varchar(50) NOT NULL,
  age int(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO employee_demographics (name, age) VALUES ('Alice', 30);
INSERT INTO employee_demographics (name, age) VALUES ('Bob', 35);
